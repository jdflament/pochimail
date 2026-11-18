import type { IncomingMessage } from "../domain/mail.ts";
import type { StorageError } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";
import type { AccountId, MessageId, WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";
import { sanitizeIncoming } from "./run-incremental-sync.ts";

export interface StoreMessagesDeps {
  readonly uow: UnitOfWork;
}

export interface StoreMessagesRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  readonly messages: readonly IncomingMessage[];
}

/**
 * Stores one fetched batch (the "sync" stage of the scan pipeline, which owns the cursor).
 * Same boundary rules as `RunIncrementalSync`: the provider is untrusted, so each message is
 * re-validated, foreign ones are dropped and the snippet is cut; a body is never stored (D11).
 * Rows and their event commit in ONE transaction; replaying a batch rewrites the same rows and
 * re-sends the same event id.
 */
export class StoreMessages {
  constructor(private readonly deps: StoreMessagesDeps) {}

  async execute(request: StoreMessagesRequest): AsyncResult<readonly MessageId[], StorageError> {
    const keep = request.messages.flatMap((m) => sanitizeIncoming(m, request));
    if (keep.length === 0) return ok([]);
    const first = keep[0];
    const committed = await this.deps.uow.run(async (tx) => {
      const rows = await tx.repositories.messages.upsertMany(keep);
      if (!rows.ok) return rows;
      const event = {
        id: `stored:${request.accountId}:${first?.id}:${keep.length}`,
        type: "MessagesUpserted",
        version: 1,
        workspaceId: request.workspaceId,
        occurredAt: first?.receivedAt ?? new Date(0).toISOString(),
        payload: { accountId: request.accountId, count: keep.length },
      } satisfies DomainEventOf<"MessagesUpserted">;
      return tx.outbox.append({ kind: "event", event });
    });
    if (!committed.ok) return committed;
    return ok(keep.map((m) => m.id));
  }
}
