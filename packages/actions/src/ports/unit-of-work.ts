import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { ActionLogReader, ActionLogRepository } from "./action-log-repository.ts";

/** Only exists inside `ActionsUnitOfWork.run`: the sole way to append log entries or publish events. */
export interface ActionsTransaction {
  readonly repositories: { readonly actionLog: ActionLogRepository };
  readonly events: EventSink;
}

/**
 * Log entries and their events commit atomically (ADR 0003): `work` returning `ok` commits both;
 * `err`, a throw or an aborted `signal` rolls both back.
 */
export interface ActionsUnitOfWork {
  readonly reads: { readonly actionLog: ActionLogReader };
  run<T, E>(
    work: (tx: ActionsTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
