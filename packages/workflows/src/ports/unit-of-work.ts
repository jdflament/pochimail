import type {
  AccountsTransaction,
  AccountsUnitOfWork,
} from "@pochimail/accounts/ports/unit-of-work";
import type { ActionsTransaction, ActionsUnitOfWork } from "@pochimail/actions/ports/unit-of-work";
import type {
  ClassificationTransaction,
  ClassificationUnitOfWork,
} from "@pochimail/classification/ports/unit-of-work";
import type { CleanupTransaction, CleanupUnitOfWork } from "@pochimail/cleanup/ports/unit-of-work";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { MailboxTransaction, MailboxUnitOfWork } from "@pochimail/mailbox/ports/unit-of-work";
import type { OutboxEntry } from "@pochimail/pipeline/outbox";

export interface OutboxWriter {
  append(entry: OutboxEntry): AsyncResult<void, StorageError>;
}

/** Only exists inside `WorkflowUnitOfWork.run`: the sole way to write rows or append to the outbox. */
export interface WorkflowTransaction {
  readonly repositories: AccountsTransaction["repositories"] &
    MailboxTransaction["repositories"] &
    ClassificationTransaction["repositories"] &
    CleanupTransaction["repositories"] &
    ActionsTransaction["repositories"];
  readonly outbox: OutboxWriter;
  readonly events: EventSink;
}

/**
 * Every domain's rows plus the outbox (events and jobs), committed
 * atomically (ADR 0003). Each domain's own unit of work is a narrower view of this one.
 */
export interface WorkflowUnitOfWork {
  readonly reads: AccountsUnitOfWork["reads"] &
    MailboxUnitOfWork["reads"] &
    ClassificationUnitOfWork["reads"] &
    CleanupUnitOfWork["reads"] &
    ActionsUnitOfWork["reads"];
  run<T, E>(
    work: (tx: WorkflowTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
