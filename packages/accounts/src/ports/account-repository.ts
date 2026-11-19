import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import type { Account } from "../model/account.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped.

export interface AccountReader {
  get(ws: WorkspaceId, id: AccountId): AsyncResult<Account, StorageError | NotFound>;
  list(ws: WorkspaceId): AsyncResult<readonly Account[], StorageError>;
}
export interface AccountWriter {
  save(account: Account): AsyncResult<void, StorageError>;
  /**
   * Deletes the account and every row that belongs to it (messages, threads, derived data,
   * signals, senders, suggestions, cursors, digest state). Nothing of another account changes.
   * The action log is the append-only audit trail and stays.
   */
  remove(ws: WorkspaceId, id: AccountId): AsyncResult<void, StorageError>;
}

export type AccountRepository = AccountReader & AccountWriter;
