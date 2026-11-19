import type { Clock } from "@pochimail/kernel/clock";
import type { CancelSignal } from "@pochimail/kernel/common";
import type { DomainError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import type { JobQueue } from "@pochimail/pipeline/job-queue";
import {
  type CursorStore,
  createPipeline,
  type Pipeline,
  type Stage,
} from "@pochimail/pipeline/job-runner";
import type { RetryPolicy } from "@pochimail/pipeline/retry";
import type { IncomingMessage } from "../domain/mail.ts";
import type { AccountId, MessageId } from "../ids.ts";
import type { Classifier } from "../ports/ai.ts";
import type { MailProvider, SyncCursor } from "../ports/mail-provider.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ClassifyBatch } from "../use-cases/classify-batch.ts";
import { DetectSignals } from "../use-cases/detect-signals.ts";
import { StoreMessages } from "../use-cases/store-messages.ts";

export const SCAN_PIPELINE_NAME = "scan";

export interface ScanPipelineDeps {
  readonly uow: UnitOfWork;
  readonly provider: MailProvider;
  readonly classifier: Classifier;
  readonly clock: Clock;
  readonly queue: JobQueue;
  readonly random: () => number;
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  readonly maxInFlightBatches?: number;
  readonly retryPolicy?: RetryPolicy;
  /** Called after each batch left the last stage, with its message count (progress reporting). */
  readonly onBatchProcessed?: (count: number) => Promise<void> | void;
}

/** One provider batch travels through the stages as one item. */
interface Fetched {
  readonly messages: readonly IncomingMessage[];
}
interface Stored {
  readonly ids: readonly MessageId[];
}

/**
 * sync → classify → signals as one pausable, resumable pipeline (M1-08). The pipeline persists
 * its own cursor after every fully processed batch, so a pause (aborted signal) and a later run
 * end in the same state as one uninterrupted run. Metadata only: bodies are never read (D11).
 */
export function createScanPipeline(deps: ScanPipelineDeps): Pipeline {
  const { uow, workspaceId, accountId } = deps;
  const store = new StoreMessages({ uow });
  const classify = new ClassifyBatch({ uow, classifier: deps.classifier, clock: deps.clock });
  const detect = new DetectSignals({ uow, clock: deps.clock });
  // Batches are never abandoned half-way: pausing happens between batches, in the pipeline.
  const never: CancelSignal = {
    aborted: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const cursors: CursorStore = {
    get: (scope) => uow.reads.cursors.get(workspaceId, accountId, scope),
    set: (cursor) => uow.run((tx) => tx.repositories.cursors.set(workspaceId, accountId, cursor)),
  };

  const sync: Stage<Fetched, Stored> = {
    name: "sync",
    concurrency: 1,
    process: async (item) => {
      const ids = await store.execute({ workspaceId, accountId, messages: item.messages });
      return ids.ok ? ok({ ids: ids.value }) : err(ids.error as DomainError);
    },
  };
  const classifyStage: Stage<Stored, Stored> = {
    name: "classify",
    concurrency: 1,
    process: async (item) => {
      if (item.ids.length === 0) return ok(item);
      const done = await classify.execute({ workspaceId, messageIds: item.ids }, never);
      return done.ok ? ok(item) : err(done.error);
    },
  };
  const signalsStage: Stage<Stored, number> = {
    name: "signals",
    concurrency: 1,
    process: async (item) => {
      if (item.ids.length === 0) return ok(0);
      const found = await detect.execute({ workspaceId, accountId, messageIds: item.ids }, never);
      if (!found.ok) return err(found.error);
      await deps.onBatchProcessed?.(item.ids.length);
      return ok(found.value.length);
    },
  };

  return createPipeline<Fetched>({
    name: SCAN_PIPELINE_NAME,
    workspaceId,
    cursors,
    queue: deps.queue,
    clock: deps.clock,
    random: deps.random,
    itemKey: (item) => `${item.messages[0]?.id ?? "empty"}:${item.messages.length}`,
    ...(deps.maxInFlightBatches === undefined
      ? {}
      : { maxInFlightBatches: deps.maxInFlightBatches }),
    ...(deps.retryPolicy ? { retryPolicy: deps.retryPolicy } : {}),
    source: async (cursor, signal) => {
      const fetched = await deps.provider.sync(decode(cursor), signal);
      if (!fetched.ok) return fetched;
      const { messages, nextCursor, hasMore } = fetched.value;
      return ok({
        items: messages.length === 0 ? [] : [{ messages }],
        nextCursor: encode(nextCursor),
        hasMore,
      });
    },
  })
    .stage(sync)
    .stage(classifyStage)
    .stage(signalsStage)
    .build();
}

// The pipeline keeps cursors under its own scope; the provider's scope rides inside the token.
const encode = (c: SyncCursor): SyncCursor => ({
  scope: SCAN_PIPELINE_NAME,
  token: JSON.stringify([c.scope, c.token]),
});
function decode(c: SyncCursor | null): SyncCursor | null {
  if (!c) return null;
  try {
    const [scope, token] = JSON.parse(c.token) as [string, string];
    return { scope, token };
  } catch {
    return null;
  }
}
