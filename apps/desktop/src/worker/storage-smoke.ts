import { runStorageProof } from "./storage-proof.ts";

// Runs inside Electron's utilityProcess, only in the packaging smoke test (M0-12): the database driver must load from the
// packaged app in the same process type that will own the database. Main sends the key it got from safeStorage.
process.parentPort.once(
  "message",
  ({ data }: { data: { path: string; keyHex: string; rows: number } }) => {
    try {
      const report = runStorageProof(data.path, Buffer.from(data.keyHex, "hex"), data.rows);
      process.parentPort.postMessage({ ok: true, report });
    } catch (error) {
      process.parentPort.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
