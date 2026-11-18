import { accountIdSchema, workspaceIdSchema } from "@pochimail/core/domain/common";
import type { Topic } from "@pochimail/core/domain/mail";
import { topicSchema } from "@pochimail/core/domain/mail";
import { NotFound, StorageError } from "@pochimail/core/errors";
import type { SyncCursor } from "@pochimail/core/ports/mail-provider";
import type { ReadRepositories, WriteRepositories } from "@pochimail/core/ports/repositories";
import { err, ok } from "@pochimail/core/result";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";

const cursorRow = z.object({ token: z.string() });
const topicRow = z.object({ data: z.string() });
const digestRow = z.object({ last_digest_at: z.iso.datetime() });

const guard = <T>(run: () => T) => {
  try {
    return ok(run());
  } catch (cause) {
    return err(new StorageError("Storage operation failed", { cause }));
  }
};

/**
 * Stand-in for a repository whose tables arrive with M2-03: every call returns a `StorageError`
 * so nothing silently drops data in the meantime.
 */
function pending<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: (_target, method) => async () =>
      err(new StorageError(`${name}.${String(method)} is not implemented until M2-03`)),
  });
}

/**
 * Repositories bound to one connection. M2-01 ships the tables the core needs (topics, sync
 * cursors, digest state); the mail repositories (accounts, messages, threads, derived, senders,
 * suggestions, action log, signals) land with M2-03 and fail loudly until then.
 */
export function createSqliteRepositories(db: Database): {
  reads: ReadRepositories;
  writes: WriteRepositories;
} {
  const topics = {
    async get(
      ws: Parameters<ReadRepositories["topics"]["get"]>[0],
      id: Parameters<ReadRepositories["topics"]["get"]>[1],
    ) {
      const r = guard(() =>
        db.prepare("SELECT data FROM topic WHERE workspace_id = ? AND id = ?").get(ws, id),
      );
      if (!r.ok) return r;
      if (r.value === undefined) return err(new NotFound("Topic"));
      return guard(() => topicSchema.parse(JSON.parse(topicRow.parse(r.value).data)));
    },
    async list(ws: Parameters<ReadRepositories["topics"]["list"]>[0]) {
      return guard((): readonly Topic[] =>
        db
          .prepare("SELECT data FROM topic WHERE workspace_id = ? ORDER BY id")
          .all(ws)
          .map((row) => topicSchema.parse(JSON.parse(topicRow.parse(row).data))),
      );
    },
    async save(topic: Topic) {
      return guard(() => {
        db.prepare(
          "INSERT INTO topic (workspace_id, id, data) VALUES (?, ?, ?) ON CONFLICT (workspace_id, id) DO UPDATE SET data = excluded.data",
        ).run(topic.workspaceId, topic.id, JSON.stringify(topic));
      });
    },
  };

  const cursors = {
    async get(
      ws: Parameters<ReadRepositories["cursors"]["get"]>[0],
      account: Parameters<ReadRepositories["cursors"]["get"]>[1],
      scope: string,
    ) {
      return guard((): SyncCursor | null => {
        const row = db
          .prepare(
            "SELECT token FROM cursor WHERE workspace_id = ? AND account_id = ? AND scope = ?",
          )
          .get(ws, account, scope);
        return row === undefined ? null : { scope, token: cursorRow.parse(row).token };
      });
    },
    async set(
      ws: Parameters<WriteRepositories["cursors"]["set"]>[0],
      account: Parameters<WriteRepositories["cursors"]["set"]>[1],
      cursor: SyncCursor,
    ) {
      return guard(() => {
        db.prepare(
          "INSERT INTO cursor (workspace_id, account_id, scope, token) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id, account_id, scope) DO UPDATE SET token = excluded.token",
        ).run(
          workspaceIdSchema.parse(ws),
          accountIdSchema.parse(account),
          cursor.scope,
          cursor.token,
        );
      });
    },
  };

  const digestState = {
    async get(
      ws: Parameters<ReadRepositories["digestState"]["get"]>[0],
      account: Parameters<ReadRepositories["digestState"]["get"]>[1],
    ) {
      return guard((): string | null => {
        const row = db
          .prepare(
            "SELECT last_digest_at FROM digest_state WHERE workspace_id = ? AND account_id = ?",
          )
          .get(ws, account);
        return row === undefined ? null : digestRow.parse(row).last_digest_at;
      });
    },
    async set(
      ws: Parameters<WriteRepositories["digestState"]["set"]>[0],
      account: Parameters<WriteRepositories["digestState"]["set"]>[1],
      at: string,
    ) {
      return guard(() => {
        db.prepare(
          "INSERT INTO digest_state (workspace_id, account_id, last_digest_at) VALUES (?, ?, ?) ON CONFLICT (workspace_id, account_id) DO UPDATE SET last_digest_at = excluded.last_digest_at",
        ).run(ws, account, digestRow.parse({ last_digest_at: at }).last_digest_at);
      });
    },
  };

  const unfinished = {
    accounts: pending<WriteRepositories["accounts"]>("accounts"),
    messages: pending<WriteRepositories["messages"]>("messages"),
    threads: pending<WriteRepositories["threads"]>("threads"),
    derived: pending<WriteRepositories["derived"]>("derived"),
    senders: pending<WriteRepositories["senders"]>("senders"),
    suggestions: pending<WriteRepositories["suggestions"]>("suggestions"),
    actionLog: pending<WriteRepositories["actionLog"]>("actionLog"),
    signals: pending<WriteRepositories["signals"]>("signals"),
  };
  return {
    reads: { ...unfinished, topics, cursors, digestState },
    writes: { ...unfinished, topics, cursors, digestState },
  };
}
