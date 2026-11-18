import { readdirSync, readFileSync } from "node:fs";
import { StorageError } from "@pochimail/core/errors";
import { err, ok, type Result } from "@pochimail/core/result";
import type { Database } from "better-sqlite3-multiple-ciphers";

export interface Migration {
  /** 1, 2, 3…: the value `PRAGMA user_version` holds once it has run. */
  readonly version: number;
  readonly sql: string;
}

const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** Reads the versioned `NNNN_name.sql` files of a directory, sorted, with no gaps from 1. */
export function loadMigrations(
  dir: URL = new URL("./migrations/", import.meta.url),
): readonly Migration[] {
  const migrations = readdirSync(dir)
    .map((name) => ({ name, match: FILE_NAME.exec(name) }))
    .filter((f) => f.match !== null)
    .map((f) => ({
      version: Number(f.match?.[1]),
      sql: readFileSync(new URL(f.name, dir), "utf8"),
    }))
    .sort((a, b) => a.version - b.version);
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Migration numbering has a gap before ${m.version}`);
  });
  return migrations;
}

/**
 * Brings the database to the newest version. Each migration runs in its own transaction and bumps
 * `user_version` with it, so a crash leaves the previous version intact; running it again does
 * nothing. A database written by a newer build is refused rather than guessed at.
 */
export function migrate(
  db: Database,
  migrations: readonly Migration[] = loadMigrations(),
): Result<{ from: number; to: number }, StorageError> {
  const latest = migrations.at(-1)?.version ?? 0;
  try {
    const from = Number(db.pragma("user_version", { simple: true }));
    if (from > latest) {
      return err(
        new StorageError(`Database version ${from} is newer than this app supports (${latest})`),
      );
    }
    for (const m of migrations.filter((x) => x.version > from)) {
      db.transaction(() => {
        db.exec(m.sql);
        db.pragma(`user_version = ${m.version}`);
      })();
    }
    return ok({ from, to: latest });
  } catch (cause) {
    return err(new StorageError("Database migration failed", { cause }));
  }
}
