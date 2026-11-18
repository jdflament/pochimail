import type { Clock } from "../clock.ts";
import type { Account } from "../domain/account.ts";
import { Cancelled, type NotFound, type StorageError } from "../errors.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { TokenRevoker } from "../ports/oauth.ts";
import type { SecretStore } from "../ports/secret-store.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { err, ok } from "../result.ts";
import { accountStateEvent } from "./account-state.ts";
import { accountSecretKey } from "./connect-account.ts";

export interface RemoveAccountDeps {
  readonly uow: UnitOfWork;
  readonly secrets: SecretStore;
  readonly revoker: TokenRevoker;
  readonly clock: Clock;
}

export interface RemoveAccountRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
}

export interface RemoveAccountOutcome {
  readonly account: Account;
  /** `false`: the provider could not be reached or has no revocation endpoint; local removal still happened. */
  readonly remoteRevoked: boolean;
}

/**
 * ADR 0007 "Remove account": revoke the credential at the provider, delete the keychain entry and
 * the account's local data. Order matters: the credential is revoked first (it still exists), then
 * removed from the keychain, then the rows. A revocation failure never keeps a credential on the
 * device; it is reported so the UI can say the provider may still list the app.
 */
export class RemoveAccount {
  constructor(private readonly deps: RemoveAccountDeps) {}

  async execute(
    request: RemoveAccountRequest,
    signal: CancelSignal,
  ): AsyncResult<RemoveAccountOutcome, StorageError | NotFound | Cancelled> {
    const { uow, secrets, revoker, clock } = this.deps;
    if (signal.aborted) return err(new Cancelled());
    const { workspaceId, accountId } = request;
    const found = await uow.reads.accounts.get(workspaceId, accountId);
    if (!found.ok) return found;
    const account = found.value;

    const stored = await secrets.get(accountSecretKey(account));
    if (!stored.ok) return stored;
    let remoteRevoked = false;
    if (stored.value !== null) {
      const revoked = await revoker.revoke(account.provider, stored.value, signal);
      if (!revoked.ok && revoked.error instanceof Cancelled) return err(revoked.error);
      remoteRevoked = revoked.ok;
    }

    const removedSecret = await secrets.remove(accountSecretKey(account));
    if (!removedSecret.ok) return removedSecret;

    const state = accountStateEvent({
      workspaceId,
      accountId,
      state: "disconnected",
      occurredAt: clock.now().toISOString(),
    });
    const removed = await uow.run(async (tx) => {
      const row = await tx.repositories.accounts.remove(workspaceId, accountId);
      if (!row.ok) return row;
      return tx.outbox.append({ kind: "event", event: state });
    }, signal);
    return removed.ok ? ok({ account, remoteRevoked }) : removed;
  }
}
