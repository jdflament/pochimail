import { NotFound } from "@pochimail/core/errors";
import { StorageError } from "@pochimail/kernel/errors";
import { err, ok, type Result } from "@pochimail/kernel/result";
import type { Database } from "better-sqlite3-multiple-ciphers";

// Everything here is synchronous: better-sqlite3 is, and the async repositories are thin wrappers.
// Every statement is parameterised; only fixed SQL fragments are ever concatenated.

export type Row = Record<string, unknown>;
type Done<T> = Result<T, StorageError>;
type Found<T> = Result<T, StorageError | NotFound>;

/** Ids handled per statement when a list of ids is bound as JSON. */
export const CHUNK = 200;

/** Runs `run`, turning a thrown failure (SQL, bad row, bad cursor) into a `StorageError`. */
export function guard<T>(run: () => T): Done<T> {
  try {
    return ok(run());
  } catch (cause) {
    return err(new StorageError("Storage operation failed", { cause }));
  }
}

export function find<T>(what: string, run: () => T | undefined): Found<T> {
  const r = guard(run);
  if (!r.ok) return r;
  return r.value === undefined ? err(new NotFound(what)) : ok(r.value);
}

/** Statement helpers bound to one connection. */
export function sqlHelpers(db: Database) {
  return {
    all: (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as Row[],
    one: (sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as Row | undefined,
    run: (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
    atomic: <A extends unknown[], T>(fn: (...args: A) => T) => db.transaction(fn),
  };
}
