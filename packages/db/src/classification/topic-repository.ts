import { topicSchema } from "@pochimail/classification/model/topic";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { find, guard, sqlHelpers } from "../shared/sql.ts";

const topicData = z.object({ data: z.string() });

/** Repository over one connection. */
export function createTopicRepository(db: Database) {
  const { all, one, run } = sqlHelpers(db);
  // ---- topics, cursors, digest state ----
  const topics = {
    get: (ws: string, id: string) =>
      find("Topic", () => {
        const r = one("SELECT data FROM topic WHERE workspace_id = ? AND id = ?", ws, id);
        return r === undefined ? undefined : topicSchema.parse(JSON.parse(topicData.parse(r).data));
      }),
    list: (ws: string) =>
      guard(() =>
        all("SELECT data FROM topic WHERE workspace_id = ? ORDER BY id", ws).map((r) =>
          topicSchema.parse(JSON.parse(topicData.parse(r).data)),
        ),
      ),
    save: (t: z.infer<typeof topicSchema>) =>
      guard(() => {
        run(
          "INSERT INTO topic (workspace_id, id, data) VALUES (?, ?, ?) ON CONFLICT (workspace_id, id) DO UPDATE SET data = excluded.data",
          t.workspaceId,
          t.id,
          JSON.stringify(t),
        );
      }),
  };

  return topics;
}
