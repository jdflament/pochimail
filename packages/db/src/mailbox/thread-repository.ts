import { threadSchema } from "@pochimail/core/domain/mail";
import type { Database } from "better-sqlite3-multiple-ciphers";
import type { z } from "zod";
import { find, guard, type Row, sqlHelpers } from "../shared/sql.ts";
import { json } from "../shared/values.ts";

const threadOf = (r: Row) =>
  threadSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    subject: r.subject,
    messageIds: json(r.message_ids),
    lastMessageAt: r.last_message_at,
  });

/** Repository over one connection. */
export function createThreadRepository(db: Database) {
  const { one, run } = sqlHelpers(db);
  // ---- threads ----
  const threads = {
    get: (ws: string, id: string) =>
      find("Thread", () => {
        const r = one("SELECT * FROM thread WHERE workspace_id = ? AND id = ?", ws, id);
        return r === undefined ? undefined : threadOf(r);
      }),
    upsert: (t: z.infer<typeof threadSchema>) =>
      guard(() => {
        const v = threadSchema.parse(t);
        run(
          `INSERT INTO thread (workspace_id, id, account_id, subject, message_ids, last_message_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, id) DO UPDATE SET account_id = excluded.account_id, subject = excluded.subject,
             message_ids = excluded.message_ids, last_message_at = excluded.last_message_at`,
          v.workspaceId,
          v.id,
          v.accountId,
          v.subject,
          JSON.stringify(v.messageIds),
          v.lastMessageAt,
        );
      }),
  };

  return threads;
}
