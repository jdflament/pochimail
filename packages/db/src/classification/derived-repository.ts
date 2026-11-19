import { derivedMessageSchema } from "@pochimail/core/domain/derived";
import type { Database } from "better-sqlite3-multiple-ciphers";
import type { z } from "zod";
import { decodeCursor, page } from "../shared/paging.ts";
import { find, guard, type Row, sqlHelpers } from "../shared/sql.ts";
import { orUndefined, text } from "../shared/values.ts";

const derivedOf = (r: Row) =>
  derivedMessageSchema.parse({
    schemaVersion: 1,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    messageId: r.message_id,
    category: r.category,
    reason: r.reason,
    confidence: r.confidence,
    modelVersion: r.model_version,
    ...orUndefined("templateHash", r.template_hash),
    ...orUndefined("embeddingRef", r.embedding_ref),
    snippet: r.snippet,
    derivedAt: r.derived_at,
  });

/** Repository over one connection. */
export function createDerivedRepository(db: Database) {
  const { all, one, run } = sqlHelpers(db);
  // ---- derived data ----
  const derived = {
    get: (ws: string, id: string) =>
      find("Derived data", () => {
        const r = one("SELECT * FROM derived WHERE workspace_id = ? AND message_id = ?", ws, id);
        return r === undefined ? undefined : derivedOf(r);
      }),
    list: (ws: string, account: string, p: { limit: number; cursor?: string }) =>
      guard(() => {
        const after = p.cursor === undefined ? undefined : decodeCursor(p.cursor, 1)[0];
        const limit = Math.max(1, Math.floor(p.limit));
        const rows = all(
          `SELECT * FROM derived WHERE workspace_id = ? AND account_id = ?
             ${after === undefined ? "" : "AND message_id > ?"} ORDER BY message_id LIMIT ?`,
          ws,
          account,
          ...(after === undefined ? [] : [after]),
          limit + 1,
        );
        return page(rows, limit, derivedOf, (r) => [text(r.message_id)]);
      }),
    save: (d: z.infer<typeof derivedMessageSchema>) =>
      guard(() => {
        const v = derivedMessageSchema.parse(d);
        run(
          `INSERT INTO derived (workspace_id, message_id, account_id, category, reason, confidence, model_version,
             template_hash, embedding_ref, snippet, derived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, message_id) DO UPDATE SET account_id = excluded.account_id,
             category = excluded.category, reason = excluded.reason, confidence = excluded.confidence,
             model_version = excluded.model_version, template_hash = excluded.template_hash,
             embedding_ref = excluded.embedding_ref, snippet = excluded.snippet, derived_at = excluded.derived_at`,
          v.workspaceId,
          v.messageId,
          v.accountId,
          v.category,
          v.reason,
          v.confidence,
          v.modelVersion,
          v.templateHash ?? null,
          v.embeddingRef ?? null,
          v.snippet,
          v.derivedAt,
        );
      }),
  };

  return derived;
}
