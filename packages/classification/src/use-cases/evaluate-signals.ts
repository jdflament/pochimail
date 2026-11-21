import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import { ok } from "@pochimail/kernel/result";
import { categoryOf } from "../model/category.ts";
import type { StoredSignal } from "../model/signal.ts";
import { IMPORTANT_REPLY_COUNT, signalRules } from "../policies/signal-rules.ts";
import type { DerivedReader } from "../ports/derived-repository.ts";
import type { SignalFactsSource } from "../ports/message-source.ts";

export interface EvaluateSignalsRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  readonly messageIds: readonly MessageId[];
}

/**
 * Evaluates the six signals for stored messages without storing or announcing anything. Reads
 * headers, metadata and the derived data only; it never needs a body (proposed D11). Output is
 * sorted, so a given mailbox and clock always give the same answer.
 */
export class EvaluateSignals {
  constructor(
    private readonly deps: {
      readonly signalFacts: SignalFactsSource;
      readonly derived: DerivedReader;
    },
  ) {}

  async execute(
    request: EvaluateSignalsRequest,
    now: Date,
  ): AsyncResult<StoredSignal[], StorageError | NotFound> {
    const { workspaceId: ws } = request;
    const facts = await this.deps.signalFacts.forMessages(
      ws,
      request.accountId,
      [...request.messageIds].sort(),
    );
    if (!facts.ok) return facts;
    const out: StoredSignal[] = [];
    for (const f of facts.value) {
      const derived = await this.deps.derived.get(ws, f.messageId);
      if (!derived.ok && derived.error.code !== "storage.not_found") return derived;
      const category = derived.ok
        ? derived.value.category
        : categoryOf({ category: f.storedCategory });
      const text = `${f.subject} ${derived.ok ? derived.value.snippet : f.snippet}`;
      for (const hit of signalRules({
        from: f.from,
        receivedAt: f.receivedAt,
        opened: f.opened,
        category,
        text,
        ownerAddress: f.ownerAddress,
        now,
        lastInThread: f.lastInThread,
        important: f.senderVip || f.senderRepliedCount >= IMPORTANT_REPLY_COUNT,
      })) {
        out.push({
          schemaVersion: 1,
          workspaceId: ws,
          messageId: f.messageId,
          kind: hit.kind,
          confidence: hit.confidence,
          detectedAt: now.toISOString(),
          reason: hit.reason,
        });
      }
    }
    return ok(out);
  }
}
