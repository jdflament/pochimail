import { createHash } from "node:crypto";
import { NotFound } from "@pochimail/core/errors";
import type { BlobStore } from "@pochimail/core/ports/blob-store";
import { Cancelled, type StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "./faults.ts";

export interface InMemoryBlobStore extends BlobStore {
  readonly faults: Faults<StorageError>;
}

export function createInMemoryBlobStore(): InMemoryBlobStore {
  const blobs = new Map<string, Uint8Array>();
  const faults = createFaults<StorageError>();
  return {
    faults,
    async put(bytes, signal) {
      if (signal?.aborted) return err(new Cancelled());
      const failure = faults.take();
      if (failure) return err(failure);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      blobs.set(sha256, bytes.slice());
      return ok({ sha256, sizeBytes: bytes.byteLength });
    },
    async get(sha256, signal) {
      if (signal?.aborted) return err(new Cancelled());
      const failure = faults.take();
      if (failure) return err(failure);
      const found = blobs.get(sha256);
      return found ? ok(found.slice()) : err(new NotFound("Blob"));
    },
    async has(sha256) {
      const failure = faults.take();
      return failure ? err(failure) : ok(blobs.has(sha256));
    },
  };
}
