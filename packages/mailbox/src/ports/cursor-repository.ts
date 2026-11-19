import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import type { SyncCursor } from "./mail-reader.ts";

export interface CursorReader {
  /** `null` when no cursor is stored yet (start a backfill). */
  get(
    ws: WorkspaceId,
    accountId: AccountId,
    scope: string,
  ): AsyncResult<SyncCursor | null, StorageError>;
}
export interface CursorWriter {
  set(ws: WorkspaceId, accountId: AccountId, cursor: SyncCursor): AsyncResult<void, StorageError>;
}

export type CursorRepository = CursorReader & CursorWriter;
