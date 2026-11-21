import { suggestionSchema } from "@pochimail/cleanup/model/suggestion";
import type { Database } from "better-sqlite3-multiple-ciphers";
import type { z } from "zod";
import { decodeCursor, page } from "../shared/paging.ts";
import { find, guard, type Row, sqlHelpers } from "../shared/sql.ts";
import { json, text } from "../shared/values.ts";

const suggestionOf = (r: Row) =>
  suggestionSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    recommendation: json(r.command),
    reasons: json(r.reasons),
    confidence: r.confidence,
    state: r.state,
    createdAt: r.created_at,
  });

/** Repository over one connection. */
export function createSuggestionRepository(db: Database) {
  const { all, one, run } = sqlHelpers(db);
  // ---- suggestions ----
  const suggestions = {
    get: (ws: string, id: string) =>
      find("Suggestion", () => {
        const r = one("SELECT * FROM suggestion WHERE workspace_id = ? AND id = ?", ws, id);
        return r === undefined ? undefined : suggestionOf(r);
      }),
    listPending: (ws: string, p: { limit: number; cursor?: string }) =>
      guard(() => {
        const after = p.cursor === undefined ? undefined : decodeCursor(p.cursor, 2);
        const limit = Math.max(1, Math.floor(p.limit));
        const rows = all(
          `SELECT * FROM suggestion WHERE workspace_id = ? AND state = 'pending'
             ${after === undefined ? "" : "AND (created_at > ? OR (created_at = ? AND id > ?))"}
           ORDER BY created_at, id LIMIT ?`,
          ws,
          ...(after === undefined ? [] : [after[0], after[0], after[1]]),
          limit + 1,
        );
        return page(rows, limit, suggestionOf, (r) => [text(r.created_at), text(r.id)]);
      }),
    save: (s: z.infer<typeof suggestionSchema>) =>
      guard(() => {
        const v = suggestionSchema.parse(s);
        run(
          `INSERT INTO suggestion (workspace_id, id, account_id, state, confidence, created_at, command, reasons)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, id) DO UPDATE SET account_id = excluded.account_id, state = excluded.state,
             confidence = excluded.confidence, created_at = excluded.created_at,
             command = excluded.command, reasons = excluded.reasons`,
          v.workspaceId,
          v.id,
          v.accountId,
          v.state,
          v.confidence,
          v.createdAt,
          JSON.stringify(v.recommendation),
          JSON.stringify(v.reasons),
        );
      }),
  };

  return suggestions;
}
