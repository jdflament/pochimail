import type { StorageProofReport } from "../src/worker/storage-proof.ts";

type Protection =
  | { level: "os-keychain"; backend: string }
  | { level: "basic-text" }
  | { level: "unavailable" };
export type StorageSmoke = { protection: Protection; report: StorageProofReport };

/** Reads the `smoke:storage` line the packaged app prints and fails on anything short of a full pass. */
export const checkStorageOutput = (output: string): StorageSmoke => {
  const line = output.split("\n").find((l) => l.startsWith("smoke:storage "));
  if (line === undefined)
    throw new Error(`The packaged app printed no storage result. Output: ${output}`);
  const parsed = JSON.parse(line.slice("smoke:storage ".length)) as {
    protection: Protection;
    result: { ok: true; report: StorageProofReport } | { ok: false; error: string };
  };
  if (!parsed.result.ok) throw new Error(`Encrypted database proof failed: ${parsed.result.error}`);
  const { report } = parsed.result;
  const failures = [
    [report.journalMode === "wal", `journal_mode is ${report.journalMode}`],
    [report.fts5Compiled, "FTS5 is not compiled in"],
    [report.ftsHits > 0, "the FTS5 query found nothing"],
    [report.headerEncrypted, "the file starts with the plain SQLite header"],
    [report.wrongKeyRejected, "a wrong key opened the database"],
    [report.rightKeyReopens, "the right key did not reopen the database"],
  ]
    .filter(([ok]) => ok !== true)
    .map(([, why]) => String(why));
  // macOS and Windows have a real keychain; Linux may legitimately fall back to basic_text (documented in ADR 0005).
  if (process.platform !== "linux" && parsed.protection.level !== "os-keychain")
    failures.push(
      `safeStorage key protection is ${parsed.protection.level}, expected the OS keychain`,
    );
  if (failures.length > 0)
    throw new Error(`Encrypted database proof failed: ${failures.join("; ")}`);
  return { protection: parsed.protection, report };
};

export const storageSummary = (platform: string, { protection, report }: StorageSmoke): string =>
  [
    `### Encrypted SQLite (${platform}, packaged app)`,
    "",
    "| Check | Result |",
    "| --- | --- |",
    `| Driver | better-sqlite3-multiple-ciphers, SQLite ${report.sqliteVersion}, cipher ${report.cipher} |`,
    `| Key protection | ${protection.level === "os-keychain" ? `OS keychain (${protection.backend})` : protection.level} |`,
    `| Journal mode / FTS5 | ${report.journalMode} / ${report.fts5Compiled ? "compiled" : "missing"} |`,
    `| ${report.rows.toLocaleString("en-US")}-row insert (with FTS5) | ${report.insertMs} ms |`,
    `| FTS5 query (${report.ftsHits} hits) | ${report.ftsQueryMs} ms |`,
    `| Indexed lookup, top 50 | ${report.indexedQueryMs} ms |`,
    `| GROUP BY sender | ${report.groupByMs} ms |`,
    `| Reopen with key | ${report.reopenMs} ms |`,
    "",
  ].join("\n");
