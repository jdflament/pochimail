import type { Cancelled, StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { Result } from "../result.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";
import type { BusEvent } from "./event-bus.ts";
import type { JobRequest } from "./job-queue.ts";
import type { ReadRepositories, WriteRepositories } from "./repositories.ts";

/** What a transaction produces besides rows: an event for the bus, or a job for the queue. */
export type OutboxEntry =
  | { readonly kind: "event"; readonly event: BusEvent }
  | { readonly kind: "job"; readonly workspaceId: WorkspaceId; readonly job: JobRequest };

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
