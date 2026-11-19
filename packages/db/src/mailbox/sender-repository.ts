import { senderStatsSchema } from "@pochimail/core/domain/mail";
import type { Database } from "better-sqlite3-multiple-ciphers";
import type { z } from "zod";
import { decodeCursor, page } from "../shared/paging.ts";
import { find, guard, type Row, sqlHelpers } from "../shared/sql.ts";
import { flag, text } from "../shared/values.ts";

const senderOf = (r: Row) =>
  senderStatsSchema.parse({
    schemaVersion: 1,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    address: r.address,
    messageCount: r.message_count,
    openedCount: r.opened_count,
    repliedCount: r.replied_count,
    lastMessageAt: r.last_message_at,
    vip: flag(r.vip),
  });

/** Repository over one connection. */
export function createSenderRepository(db: Database) {
  const { all, one, run } = sqlHelpers(db);
  // ---- sender stats ----
  const senders = {
    get: (ws: string, account: string, address: string) =>
      find("Sender", () => {
        const r = one(
          "SELECT * FROM sender_stats WHERE workspace_id = ? AND account_id = ? AND address = ?",
          ws,
          account,
          address,
        );
        return r === undefined ? undefined : senderOf(r);
      }),
    list: (ws: string, account: string, p: { limit: number; cursor?: string }) =>
      guard(() => {
        const after = p.cursor === undefined ? undefined : decodeCursor(p.cursor, 1)[0];
        const limit = Math.max(1, Math.floor(p.limit));
        const rows = all(
          `SELECT * FROM sender_stats WHERE workspace_id = ? AND account_id = ?
             ${after === undefined ? "" : "AND address > ?"} ORDER BY address LIMIT ?`,
          ws,
          account,
          ...(after === undefined ? [] : [after]),
          limit + 1,
        );
        return page(rows, limit, senderOf, (r) => [text(r.address)]);
      }),
    upsert: (s: z.infer<typeof senderStatsSchema>) =>
      guard(() => {
        const v = senderStatsSchema.parse(s);
        run(
          `INSERT INTO sender_stats (workspace_id, account_id, address, message_count, opened_count, replied_count, last_message_at, vip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, account_id, address) DO UPDATE SET message_count = excluded.message_count,
             opened_count = excluded.opened_count, replied_count = excluded.replied_count,
             last_message_at = excluded.last_message_at, vip = excluded.vip`,
          v.workspaceId,
          v.accountId,
          v.address,
          v.messageCount,
          v.openedCount,
          v.repliedCount,
          v.lastMessageAt,
          v.vip ? 1 : 0,
        );
      }),
  };

  return senders;
}
