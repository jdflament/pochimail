import type { Clock } from "../clock.ts";
import { type Account, accountSchema, type ProviderKind } from "../domain/account.ts";
import { Cancelled, InvalidStateError, type StorageError } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";
import { AccountId, type WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { IdGenerator } from "../ports/id-generator.ts";
import type { SecretStore } from "../ports/secret-store.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { err, ok } from "../result.ts";

export interface ConnectAccountDeps {
  readonly uow: UnitOfWork;
  readonly secrets: SecretStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface ConnectAccountRequest {
  readonly workspaceId: WorkspaceId;
  readonly provider: ProviderKind;
  readonly address: string;
  /** OAuth refresh token or app password. Goes to the secret store only, never to a row or event. */
  readonly credentials: string;
}

export interface ConnectAccountOutcome {
  /** `already-connected`: the account existed; only its credentials were refreshed. */
  readonly status: "connected" | "already-connected";
  readonly account: Account;
}

/** Where the credentials of an account live in the secret store. */
export const accountSecretKey = (account: Pick<Account, "workspaceId" | "id">): string =>
  `account/${account.workspaceId}/${account.id}`;

/**
 * Stores the account row and its credentials through ports and emits `AccountConnected`.
 *
 * Idempotent per (workspace, provider, address): connecting again returns the same account,
 * refreshes the stored credentials (this is how a re-auth lands) and emits nothing. The
 * credentials are written before the row so a crash never leaves an account without its secret;
 * if the row fails to commit, the secret is removed again.
 */
export class ConnectAccount {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: ConnectAccountDeps) {}

  execute(
    request: ConnectAccountRequest,
    signal: CancelSignal,
  ): AsyncResult<ConnectAccountOutcome, StorageError | InvalidStateError | Cancelled> {
    // Two concurrent calls for one account run one after the other, so the second sees the first.
    const key = [request.workspaceId, request.provider, request.address.trim().toLowerCase()].join(
      "\u0000",
    );
    const previous = this.inFlight.get(key) ?? Promise.resolve();
    const run = previous.then(() => this.connect(request, signal));
    const settled = run.catch(() => undefined);
    this.inFlight.set(key, settled);
    void settled.then(() => {
      if (this.inFlight.get(key) === settled) this.inFlight.delete(key);
    });
    return run;
  }

  private async connect(
    request: ConnectAccountRequest,
    signal: CancelSignal,
  ): AsyncResult<ConnectAccountOutcome, StorageError | InvalidStateError | Cancelled> {
    const { uow, secrets, clock, ids } = this.deps;
    if (signal.aborted) return err(new Cancelled());
    const address = request.address.trim().toLowerCase();
    if (request.credentials.length === 0) return err(new InvalidStateError("Missing credentials"));

    const existing = await uow.reads.accounts.list(request.workspaceId);
    if (!existing.ok) return existing;
    const known = existing.value.find(
      (a) => a.provider === request.provider && a.address === address,
    );

    if (known) {
      const stored = await secrets.set(accountSecretKey(known), request.credentials);
      return stored.ok ? ok({ status: "already-connected", account: known }) : stored;
    }

    const id = AccountId(ids.next("acc"));
    if (!id.ok) return err(new InvalidStateError("Generated account id is invalid"));
    const parsed = accountSchema.safeParse({
      schemaVersion: 1,
      id: id.value,
      workspaceId: request.workspaceId,
      provider: request.provider,
      address,
      connectedAt: clock.now().toISOString(),
    });
    if (!parsed.success) return err(new InvalidStateError("Invalid account details"));
    const account = parsed.data;

    const stored = await secrets.set(accountSecretKey(account), request.credentials);
    if (!stored.ok) return stored;

    const base = {
      version: 1 as const,
      workspaceId: account.workspaceId,
      occurredAt: account.connectedAt,
    };
    const connected = {
      ...base,
      id: `account-connected:${account.id}`,
      type: "AccountConnected",
      payload: { accountId: account.id, provider: account.provider },
    } satisfies DomainEventOf<"AccountConnected">;
    const state = {
      ...base,
      id: `account-state:${account.id}:connected`,
      type: "AccountStateChanged",
      payload: { accountId: account.id, state: "connected" },
    } satisfies DomainEventOf<"AccountStateChanged">;

    const saved = await uow.run(async (tx) => {
      const row = await tx.repositories.accounts.save(account);
      if (!row.ok) return row;
      const first = await tx.outbox.append({ kind: "event", event: connected });
      if (!first.ok) return first;
      return tx.outbox.append({ kind: "event", event: state });
    }, signal);
    if (!saved.ok) {
      await secrets.remove(accountSecretKey(account));
      return saved;
    }
    return ok({ status: "connected", account });
  }
}
