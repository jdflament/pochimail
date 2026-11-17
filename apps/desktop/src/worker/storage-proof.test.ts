import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openEncrypted, runStorageProof } from "./storage-proof.ts";

const dbPath = () => join(mkdtempSync(join(tmpdir(), "pochimail-db-")), "proof.db");

describe("encrypted storage proof", () => {
  // Guards: a build without FTS5/WAL, a plaintext file, or a wrong key that still opens the database.
  it("creates an encrypted WAL database with FTS5 that only the right key opens", () => {
    const report = runStorageProof(dbPath(), Buffer.alloc(32, 7), 2_000);
    expect(report).toMatchObject({
      journalMode: "wal",
      fts5Compiled: true,
      headerEncrypted: true,
      wrongKeyRejected: true,
      rightKeyReopens: true,
    });
    expect(report.ftsHits).toBeGreaterThan(0);
  });

  // Guards: a key of the wrong length silently derived into something weaker.
  it("rejects a key that is not 32 bytes", () => {
    expect(() => openEncrypted(dbPath(), Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});
