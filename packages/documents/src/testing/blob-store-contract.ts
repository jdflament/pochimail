import { createHash } from "node:crypto";
import { unwrap } from "@pochimail/kernel/result";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { expect } from "vitest";
import type { BlobStore } from "../ports/blob-store.ts";

const bytes = (...n: number[]) => new Uint8Array(n);

export const blobStoreChecks: readonly Check<BlobStore>[] = [
  check(
    "put returns the real SHA-256 and size (guards refs that do not match content)",
    async (store) => {
      const data = bytes(1, 2, 3, 4);
      const ref = unwrap(await store.put(data));
      expect(ref).toEqual({
        sha256: createHash("sha256").update(data).digest("hex"),
        sizeBytes: 4,
      });
    },
  ),
  check(
    "the same bytes give the same ref and one blob (guards duplicate attachment storage)",
    async (store) => {
      const a = unwrap(await store.put(bytes(9, 9)));
      const b = unwrap(await store.put(bytes(9, 9)));
      expect(b).toEqual(a);
    },
  ),
  check("get returns exactly what was put (guards corrupted attachments)", async (store) => {
    const ref = unwrap(await store.put(bytes(5, 6, 7)));
    expect(unwrap(await store.get(ref.sha256))).toEqual(bytes(5, 6, 7));
    expect(unwrap(await store.has(ref.sha256))).toBe(true);
  }),
  check(
    "an unknown hash is NotFound and has() is false (guards returning empty bytes for a missing blob)",
    async (store) => {
      const missing = "0".repeat(64);
      const r = await store.get(missing);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("storage.not_found");
      expect(unwrap(await store.has(missing))).toBe(false);
    },
  ),
  check(
    "stored bytes are isolated from the caller's buffers (guards later mutation rewriting a stored blob)",
    async (store) => {
      const input = bytes(1, 1, 1);
      const ref = unwrap(await store.put(input));
      input[0] = 99;
      const out = unwrap(await store.get(ref.sha256));
      expect(out).toEqual(bytes(1, 1, 1));
      out[1] = 77;
      expect(unwrap(await store.get(ref.sha256))).toEqual(bytes(1, 1, 1));
    },
  ),
  check(
    "an aborted put is Cancelled and stores nothing (guards a cancelled import leaving blobs behind)",
    async (store) => {
      const controller = new AbortController();
      controller.abort();
      const data = bytes(4, 2);
      const r = await store.put(data, controller.signal);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("operation.cancelled");
      const sha = createHash("sha256").update(data).digest("hex");
      expect(unwrap(await store.has(sha))).toBe(false);
    },
  ),
];

/** Contract for any `BlobStore`. `make` returns a fresh, empty store. */
export function blobStoreContract(make: () => BlobStore | Promise<BlobStore>): void {
  registerContract("BlobStore contract", blobStoreChecks, make);
}
