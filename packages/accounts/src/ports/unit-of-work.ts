import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { AccountReader, AccountRepository } from "./account-repository.ts";

/** Only exists inside `AccountsUnitOfWork.run`: the sole way to write accounts or publish events. */
export interface AccountsTransaction {
  readonly repositories: { readonly accounts: AccountRepository };
  readonly events: EventSink;
}

/**
 * Account writes and their events commit atomically: `work` returning `ok` commits both; `err`,
 * a throw or an aborted `signal` rolls both back. Outside it there are read-only repositories.
 */
export interface AccountsUnitOfWork {
  readonly reads: { readonly accounts: AccountReader };
  run<T, E>(
    work: (tx: AccountsTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
