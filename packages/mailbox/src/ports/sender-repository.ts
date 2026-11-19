import type { AsyncResult, Page, PageRequest } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import type { SenderStats } from "../model/sender-stats.ts";

export interface SenderReader {
  get(
    ws: WorkspaceId,
    accountId: AccountId,
    address: string,
  ): AsyncResult<SenderStats, StorageError | NotFound>;
  list(
    ws: WorkspaceId,
    accountId: AccountId,
    page: PageRequest,
  ): AsyncResult<Page<SenderStats>, StorageError>;
}
export interface SenderWriter {
  upsert(stats: SenderStats): AsyncResult<void, StorageError>;
}

export type SenderRepository = SenderReader & SenderWriter;
