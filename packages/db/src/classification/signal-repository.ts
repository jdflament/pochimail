import { type StoredSignal, signalSchema } from "@pochimail/classification/model/signal";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { CHUNK, guard, type Row, sqlHelpers } from "../shared/sql.ts";

const signalOf = (r: Row): StoredSignal => ({
  ...signalSchema.parse({
    schemaVersion: 1,
    workspaceId: r.workspace_id,
    messageId: r.message_id,
    kind: r.kind,
    confidence: r.confidence,
    detectedAt: r.detected_at,
  }),
  reason: z.string().parse(r.reason),
});

/** Repository over one connection. */
export function createSignalRepository(db: Database) {
  const { all, run, atomic } = sqlHelpers(db);
  // ---- signals ----
  const replaceSignals = atomic(
    (ws: string, ids: readonly string[], rows: readonly StoredSignal[]) => {
      for (let i = 0; i < ids.length; i += CHUNK)
        run(
          "DELETE FROM signal WHERE workspace_id = ? AND message_id IN (SELECT value FROM json_each(?))",
          ws,
          JSON.stringify(ids.slice(i, i + CHUNK)),
        );
      for (const s of rows)
        run(
          `INSERT INTO signal (workspace_id, message_id, kind, confidence, detected_at, reason) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (workspace_id, message_id, kind) DO UPDATE SET confidence = excluded.confidence,
           detected_at = excluded.detected_at, reason = excluded.reason`,
          s.workspaceId,
          s.messageId,
          s.kind,
          s.confidence,
          s.detectedAt,
          s.reason,
        );
    },
  );
  const signals = {
    listForMessages: (ws: string, ids: readonly string[]) =>
      guard(() => {
        const out: StoredSignal[] = [];
        for (let i = 0; i < ids.length; i += CHUNK)
          out.push(
            ...all(
              "SELECT * FROM signal WHERE workspace_id = ? AND message_id IN (SELECT value FROM json_each(?))",
              ws,
              JSON.stringify(ids.slice(i, i + CHUNK)),
            ).map(signalOf),
          );
        return out.sort(
          (a, b) =>
            (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0) ||
            (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
        );
      }),
    replaceForMessages: (ws: string, ids: readonly string[], rows: readonly StoredSignal[]) =>
      guard(() => replaceSignals(ws, ids, rows)),
  };

  return signals;
}
