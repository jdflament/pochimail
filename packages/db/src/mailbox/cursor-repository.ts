import type { SyncCursor } from "@pochimail/mailbox/ports/mail-reader";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { guard, sqlHelpers } from "../shared/sql.ts";

const cursorToken = z.object({ token: z.string() });

/** Repository over one connection. */
export function createCursorRepository(db: Database) {
  const { one, run } = sqlHelpers(db);
  const cursors = {
    get: (ws: string, account: string, scope: string) =>
      guard((): SyncCursor | null => {
        const r = one(
          "SELECT token FROM cursor WHERE workspace_id = ? AND account_id = ? AND scope = ?",
          ws,
          account,
          scope,
        );
        return r === undefined ? null : { scope, token: cursorToken.parse(r).token };
      }),
    set: (ws: string, account: string, cursor: SyncCursor) =>
      guard(() => {
        run(
          "INSERT INTO cursor (workspace_id, account_id, scope, token) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id, account_id, scope) DO UPDATE SET token = excluded.token",
          ws,
          account,
          cursor.scope,
          cursor.token,
        );
      }),
  };

  return cursors;
}
