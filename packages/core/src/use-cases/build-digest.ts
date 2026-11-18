import type { Clock } from "../clock.ts";
import type { Category } from "../domain/category.ts";
import type { Digest } from "../domain/digest.ts";
import type { Cancelled, NotFound, StorageError } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";
import type { AccountId, MessageId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";
import { evaluateSignals } from "./detect-signals.ts";

const PAGE = 200;
/** Before any digest exists, all stored mail counts as new. */
export const FIRST_DIGEST_SINCE = "1970-01-01T00:00:00.000Z";

export interface BuildDigestDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface BuildDigestRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  /**
   * Older mail is not summarized. Default: when the account's previous digest was generated
   * (stored state), or everything before the first digest. An explicit value is for tests.
   */
  readonly since?: string;
}

export type BuildDigestError = StorageError | NotFound | Cancelled;

/** Signals worth interrupting someone for; the rest stay in the Overview (brief §7). */
const ATTENTION = ["needs-reply", "time-sensitive", "important-sender", "has-document"] as const;

/**
 * Builds the "what's new" summary: only mail received after `since`, never totals of old mail
 * (brief §7). Counts by category plus the new messages that need attention. A digest with
 * nothing new is returned but announces nothing (`DigestReady` only when there are items).
 */
export class BuildDigest {
  constructor(private readonly deps: BuildDigestDeps) {}

  async execute(
    request: BuildDigestRequest,
    signal: CancelSignal,
  ): AsyncResult<Digest, BuildDigestError> {
    const { uow, clock } = this.deps;
    let since = request.since;
    if (since === undefined) {
      const last = await uow.reads.digestState.get(request.workspaceId, request.accountId);
      if (!last.ok) return last;
      since = last.value ?? FIRST_DIGEST_SINCE;
    }
    // "New" means stored since the last digest (ingest sequence), not dated after it: mail that
    // is delivered late with an old date must still show up. An explicit `since` is a date filter.
    const lastSequence = await uow.reads.digestState.getSequence(
      request.workspaceId,
      request.accountId,
    );
    if (!lastSequence.ok) return lastSequence;
    const newest = await uow.reads.messages.latestSequence(request.workspaceId, request.accountId);
    if (!newest.ok) return newest;
    const byDate = request.since !== undefined;
    const fresh: { id: MessageId; category: Category }[] = [];
    let cursor: string | undefined;
    do {
      const page = await uow.reads.messages.query(request.workspaceId, {
        accountId: request.accountId,
        limit: PAGE,
        ...(byDate ? {} : { afterSequence: lastSequence.value, throughSequence: newest.value }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (!page.ok) return page;
      for (const m of page.value.items)
        if (!byDate || m.receivedAt > since) fresh.push({ id: m.id, category: m.category });
      cursor = page.value.nextCursor ?? undefined;
    } while (cursor !== undefined);

    const signals = await evaluateSignals(uow.reads, clock, {
      workspaceId: request.workspaceId,
      accountId: request.accountId,
      messageIds: fresh.map((f) => f.id),
    });
    if (!signals.ok) return signals;

    const byCategory: Digest["byCategory"] = {};
    for (const f of fresh) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    const attention = signals.value
      .filter((s) => (ATTENTION as readonly string[]).includes(s.kind))
      .map((s) => ({ messageId: s.messageId, kind: s.kind }))
      .sort((a, b) => (a.messageId + a.kind < b.messageId + b.kind ? -1 : 1));

    const generatedAt = clock.now().toISOString();
    const digest: Digest = {
      schemaVersion: 1,
      workspaceId: request.workspaceId,
      accountId: request.accountId,
      since,
      generatedAt,
      newMessageCount: fresh.length,
      byCategory,
      attention,
    };

    // The state advances only once the digest is complete, in the same commit as its event.
    const committed = await uow.run(async (tx) => {
      const advanced = await tx.repositories.digestState.set(
        request.workspaceId,
        request.accountId,
        generatedAt,
        newest.value,
      );
      if (!advanced.ok) return advanced;
      if (fresh.length === 0) return ok(undefined);
      const event = {
        id: `digest:${request.accountId}:${since}`,
        type: "DigestReady",
        version: 1,
        workspaceId: request.workspaceId,
        occurredAt: generatedAt,
        payload: { itemCount: fresh.length },
      } satisfies DomainEventOf<"DigestReady">;
      return tx.outbox.append({ kind: "event", event });
    }, signal);
    if (!committed.ok) return committed;
    return ok(digest);
  }
}
