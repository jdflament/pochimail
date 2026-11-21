// Guards: a blob store that hands back or keeps the caller's buffer, and an exporter that breaks its contract.
import { createHash } from "node:crypto";
import { failingChecks } from "@pochimail/kernel/testing/contract";
import { expect, it } from "vitest";
import type { BlobStore } from "./ports/blob-store.ts";
import { blobStoreChecks, blobStoreContract } from "./testing/blob-store-contract.ts";
import { exporterContract } from "./testing/exporter-contract.ts";
import { createFakeExporter } from "./testing/fake-exporter.ts";
import { createInMemoryBlobStore } from "./testing/in-memory-blob-store.ts";

blobStoreContract(createInMemoryBlobStore);
exporterContract(createFakeExporter);

it("a blob store that returns the caller's buffer fails the BlobStore suite", async () => {
  const broken = (): BlobStore => {
    const blobs = new Map<string, Uint8Array>();
    return {
      async put(bytes) {
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        blobs.set(sha256, bytes); // no copy
        return { ok: true, value: { sha256, sizeBytes: bytes.byteLength } };
      },
      get: createInMemoryBlobStore().get,
      has: async (sha) => ({ ok: true, value: blobs.has(sha) }),
    };
  };
  expect((await failingChecks(blobStoreChecks, broken)).length).toBeGreaterThan(0);
  expect(await failingChecks(blobStoreChecks, createInMemoryBlobStore)).toEqual([]);
});
