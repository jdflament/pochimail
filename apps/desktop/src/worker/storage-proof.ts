import { closeSync, openSync, readSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";

/** What the packaged-app proof reports (ADR 0005, M0-12). Timings are milliseconds on the machine that ran it. */
export type StorageProofReport = {
  sqliteVersion: string;
  cipher: string;
  journalMode: string;
  fts5Compiled: boolean;
  /** The first bytes of the file are not the plain "SQLite format 3" header. */
  headerEncrypted: boolean;
  wrongKeyRejected: boolean;
  rightKeyReopens: boolean;
  rows: number;
  insertMs: number;
  ftsQueryMs: number;
  ftsHits: number;
  indexedQueryMs: number;
  groupByMs: number;
  reopenMs: number;
};

const sqlcipherKeyPragma = (key: Buffer): string => `key="x'${key.toString("hex")}'"`;

/** Opens `path` with the given raw 256-bit key. The cipher pragma must come before the key. */
export const openEncrypted = (path: string, key: Buffer): Database.Database => {
  if (key.length !== 32) throw new Error("The database key must be 32 bytes");
  const db = new Database(path);
  db.pragma("cipher='sqlcipher'");
  db.pragma(sqlcipherKeyPragma(key));
  return db;
};

const isPlainSqliteFile = (path: string): boolean => {
  const fd = openSync(path, "r");
  try {
    const header = Buffer.alloc(16);
    readSync(fd, header, 0, 16, 0);
    return header.toString("latin1").startsWith("SQLite format 3");
  } finally {
    closeSync(fd);
  }
};

const time = <T>(run: () => T): { value: T; ms: number } => {
  const start = performance.now();
  const value = run();
  return { value, ms: Math.round((performance.now() - start) * 10) / 10 };
};

/** Words drawn deterministically so the FTS5 query has a known, non-trivial hit count. */
const subjectFor = (i: number): string => `Invoice ${i} from shop${i % 500} order${i % 97}`;

/**
 * Creates an encrypted WAL database with an FTS5 index over `rows` synthetic messages, queries it, then reopens it
 * with the right and a wrong key. Synthetic data only: no real mail (AGENTS.md §5).
 */
export const runStorageProof = (path: string, key: Buffer, rows: number): StorageProofReport => {
  const db = openEncrypted(path, key);
  try {
    const journalMode = String(db.pragma("journal_mode = wal", { simple: true }));
    db.pragma("synchronous = normal");
    db.exec(`
      CREATE TABLE message (id INTEGER PRIMARY KEY, sender TEXT NOT NULL, subject TEXT NOT NULL, received_at INTEGER NOT NULL);
      CREATE INDEX message_sender ON message (sender, received_at);
      CREATE VIRTUAL TABLE message_fts USING fts5(sender, subject, content='message', content_rowid='id');
    `);
    const insert = db.prepare(
      "INSERT INTO message (id, sender, subject, received_at) VALUES (?, ?, ?, ?)",
    );
    const insertFts = db.prepare(
      "INSERT INTO message_fts (rowid, sender, subject) VALUES (?, ?, ?)",
    );
    const load = db.transaction(() => {
      for (let i = 1; i <= rows; i++) {
        const sender = `shop${i % 500}@example.test`;
        const subject = subjectFor(i);
        insert.run(i, sender, subject, 1_700_000_000 + i);
        insertFts.run(i, sender, subject);
      }
    });
    const inserted = time(load);

    const fts = time(
      () =>
        db.prepare("SELECT rowid FROM message_fts WHERE message_fts MATCH ?").all("order42").length,
    );
    const indexed = time(
      () =>
        db
          .prepare("SELECT id FROM message WHERE sender = ? ORDER BY received_at DESC LIMIT 50")
          .all("shop7@example.test").length,
    );
    const grouped = time(
      () =>
        db
          .prepare("SELECT sender, COUNT(*) AS n FROM message GROUP BY sender ORDER BY n DESC")
          .all().length,
    );
    const ciphers = db.pragma("cipher", { simple: true });
    const options = db.pragma("compile_options") as { compile_options: string }[];
    const sqliteVersion = String(db.prepare("SELECT sqlite_version() AS v").pluck().get());
    db.close();

    const reopened = time(() => {
      const again = openEncrypted(path, key);
      try {
        return (again.prepare("SELECT COUNT(*) FROM message").pluck().get() as number) === rows;
      } finally {
        again.close();
      }
    });
    const wrongKeyRejected = (() => {
      const wrong = openEncrypted(path, Buffer.alloc(32, 1));
      try {
        wrong.prepare("SELECT COUNT(*) FROM message").get();
        return false;
      } catch {
        return true;
      } finally {
        wrong.close();
      }
    })();

    return {
      sqliteVersion,
      cipher: String(ciphers),
      journalMode,
      fts5Compiled: options.some((o) => o.compile_options === "ENABLE_FTS5"),
      headerEncrypted: !isPlainSqliteFile(path),
      wrongKeyRejected,
      rightKeyReopens: reopened.value,
      rows,
      insertMs: inserted.ms,
      ftsQueryMs: fts.ms,
      ftsHits: fts.value,
      indexedQueryMs: indexed.ms,
      groupByMs: grouped.ms,
      reopenMs: reopened.ms,
    };
  } finally {
    if (db.open) db.close();
  }
};
