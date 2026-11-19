import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { Result } from "@pochimail/kernel/result";
import type { OutboxEntry } from "@pochimail/pipeline/outbox";
import type { ReadRepositories, WriteRepositories } from "./repositories.ts";

export interface OutboxWriter {
  append(entry: OutboxEntry): AsyncResult<void, StorageError>;
}

/** Only exists inside `UnitOfWork.run`: the sole way to write rows or append to the outbox. */
export interface Transaction {
  readonly repositories: WriteRepositories;
  readonly outbox: OutboxWriter;
}

/**
 * Repository writes and outbox appends commit atomically (ADR 0003): `work` returning `ok`
 * commits all of them; returning `err`, throwing, or an aborted `signal` rolls back all of them.
 * Writers and the outbox are reachable only through the `Transaction` argument; outside it
 * there are read-only repositories.
 */
export interface UnitOfWork {
  readonly reads: ReadRepositories;
  run<T, E>(
    work: (tx: Transaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
