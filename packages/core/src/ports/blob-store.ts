import type { Cancelled, NotFound, StorageError } from "../errors.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";

export interface BlobRef {
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** Content-addressed: the same bytes always give the same ref. Attachments are never opened. */
export interface BlobStore {
  put(bytes: Uint8Array, signal?: CancelSignal): AsyncResult<BlobRef, StorageError | Cancelled>;
  get(
    sha256: string,
    signal?: CancelSignal,
  ): AsyncResult<Uint8Array, StorageError | NotFound | Cancelled>;
  has(sha256: string): AsyncResult<boolean, StorageError>;
}
