import type {
  WorkflowTransaction,
  WorkflowUnitOfWork,
} from "@pochimail/workflows/ports/unit-of-work";

/** Every domain's rows and the outbox in one transaction, as the in-memory store and SQLite both provide it. */
export type Transaction = WorkflowTransaction;
export type UnitOfWork = WorkflowUnitOfWork;
export type ReadRepositories = UnitOfWork["reads"];
export type WriteRepositories = Transaction["repositories"];
