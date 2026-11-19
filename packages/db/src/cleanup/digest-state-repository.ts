import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { guard, sqlHelpers } from "../shared/sql.ts";
import { countRow } from "../shared/values.ts";

const digestRow = z.object({ last_digest_at: z.iso.datetime() });

/** Repository over one connection. */
export function createDigestStateRepository(db: Database) {
  const { one, run } = sqlHelpers(db);
  const digestState = {
    get: (ws: string, account: string) =>
      guard((): string | null => {
        const r = one(
          "SELECT last_digest_at FROM digest_state WHERE workspace_id = ? AND account_id = ?",
          ws,
          account,
        );
        return r === undefined ? null : digestRow.parse(r).last_digest_at;
      }),
    getSequence: (ws: string, account: string) =>
      guard(() => {
        const r = one(
          "SELECT last_sequence AS value FROM digest_state WHERE workspace_id = ? AND account_id = ?",
          ws,
          account,
        );
        return r === undefined ? 0 : countRow.parse(r).value;
      }),
    set: (ws: string, account: string, at: string, lastSequence?: number) =>
      guard(() => {
        run(
          `INSERT INTO digest_state (workspace_id, account_id, last_digest_at, last_sequence) VALUES (?, ?, ?, coalesce(?, 0))
           ON CONFLICT (workspace_id, account_id) DO UPDATE SET last_digest_at = excluded.last_digest_at,
             last_sequence = coalesce(?, last_sequence)`,
          ws,
          account,
          digestRow.parse({ last_digest_at: at }).last_digest_at,
          lastSequence ?? null,
          lastSequence ?? null,
        );
      }),
  };

  return digestState;
}
