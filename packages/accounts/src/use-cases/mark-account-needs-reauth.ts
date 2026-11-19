import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { Cancelled, type NotFound, type StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import { accountStateEvent } from "../events.ts";
import type { AccountsUnitOfWork } from "../ports/unit-of-work.ts";

export interface MarkAccountNeedsReauthDeps {
  readonly uow: AccountsUnitOfWork;
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
    const emitted = await uow.run((tx) => tx.events.append([state]), signal);
    return emitted.ok ? ok({ state: "needs_reauth" as const }) : emitted;
  }
}
