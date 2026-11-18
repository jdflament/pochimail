import type { Clock } from "../clock.ts";
import { type IncomingMessage, incomingMessageSchema, type Thread } from "../domain/mail.ts";
import {
  AuthExpired,
  Cancelled,
  type DomainError,
  type NotFound,
  RateLimited,
  type StorageError,
} from "../errors.ts";
import type { DomainEvent, DomainEventOf, DomainEventType } from "../events/catalog.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { JobRequest } from "../ports/job-queue.ts";
import type { MailProvider, SyncCursor } from "../ports/mail-provider.ts";
import type { Transaction, UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";

/** Job type enqueued to resume a rate-limited sync; a worker maps it back to this use case. */
export const INCREMENTAL_SYNC_JOB = "sync.incremental";
export const DEFAULT_CURSOR_SCOPE = "inbox";
export const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000;
/** Longest snippet kept. Providers may hand over more; a body must never be stored (D11). */
export const MAX_SNIPPET_CHARS = 200;

export interface RunIncrementalSyncDeps {
  readonly uow: UnitOfWork;
  readonly provider: MailProvider;
  readonly clock: Clock;
}

export interface RunIncrementalSyncRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  /** Which cursor to resume from. Default `inbox`. */
  readonly cursorScope?: string;
}

interface Progress {
  readonly batches: number;
  /** Messages the provider returned. */
  readonly fetched: number;
  /** Messages written to the store (invalid or foreign ones are skipped). */
  readonly stored: number;
}

export type RunIncrementalSyncOutcome =
  | (Progress & { readonly status: "completed"; readonly restarted: boolean })
  /** The signal fired: progress is committed, a later run resumes from the cursor. */
  | (Progress & { readonly status: "paused" })
  /** The provider asked us to slow down: state `paused`, a resume job is queued for `resumeAt`. */
  | (Progress & { readonly status: "rate-limited"; readonly resumeAt: string })
  /** Credentials expired: state `needs_reauth`. */
  | (Progress & { readonly status: "needs-reauth" });

export type RunIncrementalSyncError = StorageError | NotFound | Cancelled | DomainError;

/**
 * Pulls mail by cursor and stores headers and metadata only (follows proposed D11: bodies are
 * fetched on demand and never persisted here). Each batch commits rows, the new cursor and its
 * progress events in ONE transaction, so an interruption at any point resumes with neither
 * a gap nor a repeat, and the final state equals an uninterrupted run.
 *
 * Failure handling: `RateLimited` → account state `paused` + a resume job at `resumeAt`
 * (honouring `retryAfterMs`); `AuthExpired` → `needs_reauth`; `Cancelled` or an aborted signal →
 * `paused` outcome; anything else is returned as an error with committed batches kept.
 */
export class RunIncrementalSync {
  constructor(private readonly deps: RunIncrementalSyncDeps) {}

  async execute(
    request: RunIncrementalSyncRequest,
    signal: CancelSignal,
  ): AsyncResult<RunIncrementalSyncOutcome, RunIncrementalSyncError> {
    const { uow, provider } = this.deps;
    const { workspaceId, accountId } = request;
    const scope = request.cursorScope ?? DEFAULT_CURSOR_SCOPE;

    const account = await uow.reads.accounts.get(workspaceId, accountId);
    if (!account.ok) return account;
    const stored = await uow.reads.cursors.get(workspaceId, accountId, scope);
    if (!stored.ok) return stored;

    let cursor: SyncCursor | null = stored.value;
    let progress: Progress = { batches: 0, fetched: 0, stored: 0 };
    let restarted = false;

    const event = <T extends DomainEventType>(
      type: T,
      id: string,
      payload: DomainEventOf<T>["payload"],
    ): DomainEvent =>
      ({
        id,
        type,
        version: 1,
        workspaceId,
        occurredAt: this.deps.clock.now().toISOString(),
        payload,
      }) as DomainEvent;
    const state = (s: AccountState) =>
      event(
        "AccountStateChanged",
        `account-state:${accountId}:${s}:${this.deps.clock.now().getTime()}`,
        {
          accountId,
          state: s,
        },
      );
    const emit = (events: readonly DomainEvent[], job?: JobRequest) =>
      uow.run(async (tx) => {
        for (const e of events) {
          const appended = await tx.outbox.append({ kind: "event", event: e });
          if (!appended.ok) return appended;
        }
        return job ? tx.outbox.append({ kind: "job", workspaceId, job }) : ok(undefined);
      });
    const pausedByCaller = async (): AsyncResult<
      RunIncrementalSyncOutcome,
      RunIncrementalSyncError
    > => {
      const left = await emit([state("connected")]);
      return left.ok ? ok({ status: "paused", ...progress }) : left;
    };

    const began = await emit([state("syncing")]);
    if (!began.ok) return began;

    for (;;) {
      if (signal.aborted) return pausedByCaller();
      const position = cursor?.token ?? "start";
      const batch = await provider.sync(cursor, signal);

      if (!batch.ok) {
        const failure = batch.error;
        if (failure instanceof Cancelled) return pausedByCaller();
        if (failure instanceof RateLimited) {
          const resumeAt = new Date(
            this.deps.clock.now().getTime() + (failure.retryAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS),
          ).toISOString();
          const paused = await emit([state("paused")], {
            type: INCREMENTAL_SYNC_JOB,
            payload: { accountId, cursorScope: scope },
            idempotencyKey: `${INCREMENTAL_SYNC_JOB}:${accountId}:${scope}:${resumeAt}`,
            runAt: resumeAt,
          });
          return paused.ok ? ok({ status: "rate-limited", resumeAt, ...progress }) : paused;
        }
        if (failure instanceof AuthExpired) {
          const reauth = await emit([state("needs_reauth")]);
          return reauth.ok ? ok({ status: "needs-reauth", ...progress }) : reauth;
        }
        // Offline and the rest: committed batches stay; the caller decides when to retry.
        await emit([state("connected")]);
        return batch;
      }

      const { messages, nextCursor, hasMore } = batch.value;
      const keep = messages.flatMap((m) => sanitize(m, request));
      const key = `${accountId}:${scope}:${position}`;
      const committed = await uow.run(async (tx) => {
        const rows = await tx.repositories.messages.upsertMany(keep);
        if (!rows.ok) return rows;
        const threads = await upsertThreads(tx, keep);
        if (!threads.ok) return threads;
        const saved = await tx.repositories.cursors.set(workspaceId, accountId, nextCursor);
        if (!saved.ok) return saved;
        const events = [
          event("SyncBatchFetched", `${key}:fetched`, { accountId, fetched: messages.length }),
          event("MessagesUpserted", `${key}:upserted`, { accountId, count: keep.length }),
          event("ScanProgressed", `${key}:progress`, {
            accountId,
            processed: progress.stored + keep.length,
          }),
        ];
        for (const e of events) {
          const appended = await tx.outbox.append({ kind: "event", event: e });
          if (!appended.ok) return appended;
        }
        return ok(undefined);
      });
      // Not given the signal: a fetched batch always commits, so a pause never wastes it.
      if (!committed.ok) return committed;

      progress = {
        batches: progress.batches + 1,
        fetched: progress.fetched + messages.length,
        stored: progress.stored + keep.length,
      };
      restarted = restarted || batch.value.restarted;
      cursor = nextCursor;
      if (!hasMore) break;
    }

    const done = await emit([
      event("ScanCompleted", `${accountId}:${scope}:completed:${cursor?.token ?? "start"}`, {
        accountId,
        processed: progress.stored,
      }),
      state("connected"),
    ]);
    return done.ok ? ok({ status: "completed", restarted, ...progress }) : done;
  }
}

type AccountState = DomainEventOf<"AccountStateChanged">["payload"]["state"];

/**
 * The provider is an untrusted boundary (zod): `parse` drops any field the schema does not know
 * (a smuggled `body`, `attachments`…), invalid or foreign-workspace messages are skipped, and
 * the snippet is cut to `MAX_SNIPPET_CHARS`. Only these headers and metadata reach a repository.
 */
function sanitize(message: IncomingMessage, request: RunIncrementalSyncRequest): IncomingMessage[] {
  const parsed = incomingMessageSchema.safeParse(message);
  if (!parsed.success) return [];
  const m = parsed.data;
  if (m.workspaceId !== request.workspaceId || m.accountId !== request.accountId) return [];
  return [{ ...m, snippet: m.snippet.slice(0, MAX_SNIPPET_CHARS) }];
}

/**
 * Keeps one `Thread` per stored message's thread, in the same transaction as the batch. Message
 * ids stay in arrival order (the last one is the newest), so a replay or an out-of-order
 * batch never duplicates or reorders. Subject and ids only: no body (D11).
 */
async function upsertThreads(
  tx: Transaction,
  messages: readonly IncomingMessage[],
): AsyncResult<void, StorageError> {
  const byThread = new Map<string, IncomingMessage[]>();
  for (const m of messages) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);

  for (const added of byThread.values()) {
    const first = added[0];
    if (!first) continue;
    const found = await tx.repositories.threads.get(first.workspaceId, first.threadId);
    if (!found.ok && found.error.code !== "storage.not_found") return found;
    const existing = found.ok ? found.value : null;

    // Receipt time of every message in the thread, for ordering: known ones from the store.
    const times = new Map<string, string>(added.map((m) => [m.id, m.receivedAt]));
    for (const id of existing?.messageIds ?? []) {
      if (times.has(id)) continue;
      const row = await tx.repositories.messages.get(first.workspaceId, id);
      if (!row.ok) {
        if (row.error.code === "storage.not_found") continue;
        return row;
      }
      times.set(id, row.value.receivedAt);
    }
    const ids = [...new Set([...(existing?.messageIds ?? []), ...added.map((m) => m.id)])];
    ids.sort((a, b) => {
      const ta = times.get(a) ?? "";
      const tb = times.get(b) ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : a < b ? -1 : a > b ? 1 : 0;
    });
    const earliest = ids[0] === undefined ? undefined : added.find((m) => m.id === ids[0]);
    const thread: Thread = {
      schemaVersion: 1,
      id: first.threadId,
      workspaceId: first.workspaceId,
      accountId: first.accountId,
      subject: existing?.subject ?? (earliest ?? first).subject,
      messageIds: ids as [Thread["messageIds"][number], ...Thread["messageIds"]],
      lastMessageAt: times.get(ids.at(-1) ?? "") ?? first.receivedAt,
    };
    const saved = await tx.repositories.threads.upsert(thread);
    if (!saved.ok) return saved;
  }
  return ok(undefined);
}
