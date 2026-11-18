import type { Clock } from "../clock.ts";
import { Cancelled, type NotFound, type StorageError } from "../errors.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { err, ok } from "../result.ts";
import { accountStateEvent } from "./account-state.ts";

export interface MarkAccountNeedsReauthDeps {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
}

export interface MarkAccountNeedsReauthRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
}

/**
 * Puts ONE account in `needs_reauth` after its credentials failed (ADR 0007: reconnect state).
 * Nothing else stops: other accounts, jobs and the UI keep working (brief §2).
 */
export class MarkAccountNeedsReauth {
  constructor(private readonly deps: MarkAccountNeedsReauthDeps) {}

  async execute(
    request: MarkAccountNeedsReauthRequest,
    signal: CancelSignal,
  ): AsyncResult<{ readonly state: "needs_reauth" }, StorageError | NotFound | Cancelled> {
    const { uow, clock } = this.deps;
    const { workspaceId, accountId } = request;
    const account = await uow.reads.accounts.get(workspaceId, accountId);
    if (!account.ok) return account;
    if (signal.aborted) return err(new Cancelled());
    const state = accountStateEvent({
      workspaceId,
      accountId,
      state: "needs_reauth",
      occurredAt: clock.now().toISOString(),
    });
    const emitted = await uow.run(
      (tx) => tx.outbox.append({ kind: "event", event: state }),
      signal,
    );
    return emitted.ok ? ok({ state: "needs_reauth" as const }) : emitted;
  }
}
