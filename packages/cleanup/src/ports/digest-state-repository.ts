import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";

export interface DigestStateReader {
  /** When the last digest of the account was generated; `null` before the first one. */
  get(ws: WorkspaceId, accountId: AccountId): AsyncResult<string | null, StorageError>;
  /** The ingest sequence the last digest covered up to; 0 before the first one. */
  getSequence(ws: WorkspaceId, accountId: AccountId): AsyncResult<number, StorageError>;
}
export interface DigestStateWriter {
  /** `lastSequence` is the newest ingest sequence the digest covered (default 0). */
  set(
    ws: WorkspaceId,
    accountId: AccountId,
    lastDigestAt: string,
    lastSequence?: number,
  ): AsyncResult<void, StorageError>;
}
export type DigestStateRepository = DigestStateReader & DigestStateWriter;
