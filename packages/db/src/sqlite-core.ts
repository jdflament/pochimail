import { accountSchema } from "@pochimail/core/domain/account";
import { actionLogSchema, suggestionSchema } from "@pochimail/core/domain/action";
import { CATEGORIES, type Category, categorySchema } from "@pochimail/core/domain/category";
import { derivedMessageSchema } from "@pochimail/core/domain/derived";
import type { IncomingMessage, Message, StoredSignal } from "@pochimail/core/domain/mail";
import {
  messageSchema,
  senderStatsSchema,
  signalSchema,
  threadSchema,
  topicSchema,
} from "@pochimail/core/domain/mail";
import { NotFound } from "@pochimail/core/errors";
import type { Page } from "@pochimail/core/ports/common";
import type { SyncCursor } from "@pochimail/core/ports/mail-provider";
import type { MessageQuery } from "@pochimail/core/ports/repositories";
import { StorageError } from "@pochimail/kernel/errors";
import { err, ok, type Result } from "@pochimail/kernel/result";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { z } from "zod";

// Everything here is synchronous: better-sqlite3 is, and the async repositories are thin wrappers.
// Every statement is parameterised; only fixed SQL fragments are ever concatenated.

type Row = Record<string, unknown>;
type Done<T> = Result<T, StorageError>;
type Found<T> = Result<T, StorageError | NotFound>;
/** Runs `run`, turning a thrown failure (SQL, bad row, bad cursor) into a `StorageError`. */
function guard<T>(run: () => T): Done<T> {
  try {
    return ok(run());
  } catch (cause) {
    return err(new StorageError("Storage operation failed", { cause }));
  }
}

function find<T>(what: string, run: () => T | undefined): Found<T> {
  const r = guard(run);
  if (!r.ok) return r;
  return r.value === undefined ? err(new NotFound(what)) : ok(r.value);
}

const DEFAULT_CATEGORY: Category = "notifications";
const CHUNK = 200;

// Opaque cursors: the sort key of the last row served, JSON in base64url.
const encodeCursor = (...key: (string | number)[]) =>
  Buffer.from(JSON.stringify(key)).toString("base64url");
function decodeCursor<N extends number>(cursor: string, length: N): (string | number)[] {
  const key = z
    .array(z.union([z.string(), z.number()]))
    .length(length)
    .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  return key;
}

/** `rows` holds up to `limit + 1` rows: the extra one only says there is a next page. */
function page<T>(
  rows: readonly Row[],
  limit: number,
  map: (row: Row) => T,
  key: (row: Row) => (string | number)[],
): Page<T> {
  const served = rows.slice(0, limit);
  const last = served.at(-1);
  return {
    items: served.map(map),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(...key(last)) : null,
  };
}
const text = (v: unknown) => z.string().parse(v);
const num = (v: unknown) => z.number().parse(v);

const flag = (v: unknown) => v === 1;
const json = (v: unknown) => JSON.parse(String(v)) as unknown;
const orUndefined = <K extends string>(key: K, value: unknown) =>
  value === null || value === undefined ? {} : { [key]: value };

// ---- row mappers (rows are validated by the entity schemas) ----

const messageOf = (r: Row): Message =>
  messageSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    threadId: r.thread_id,
    from: r.sender,
    to: json(r.recipients),
    subject: r.subject,
    snippet: r.snippet,
    receivedAt: r.received_at,
    hasListUnsubscribe: flag(r.has_list_unsubscribe),
    opened: flag(r.opened),
    topicIds: json(r.topic_ids),
    ...(r.suspicious_reasons === null
      ? {}
      : {
          suspicious: { reasons: json(r.suspicious_reasons), confidence: r.suspicious_confidence },
        }),
    category: r.category,
  });

const MESSAGE_COLUMNS =
  "workspace_id, id, account_id, thread_id, sender, recipients, subject, snippet, received_at, has_list_unsubscribe, opened, topic_ids, suspicious_reasons, suspicious_confidence, category";

/** `granted_scopes` is a JSON array of scope strings; a bad value means "no scopes", never a crash. */
const parseScopes = (raw: unknown): string[] => {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
};

const accountOf = (r: Row) =>
  accountSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    provider: r.provider,
    address: r.address,
    connectedAt: r.connected_at,
    grantedScopes: parseScopes(r.granted_scopes),
  });

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

const suggestionOf = (r: Row) =>
  suggestionSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    accountId: r.account_id,
    command: json(r.command),
    reasons: json(r.reasons),
    confidence: r.confidence,
    state: r.state,
    createdAt: r.created_at,
  });

/** An anonymised entry keeps its kind and message count; the ids and labels are gone. */
const redactedCommand = (kind: unknown, count: unknown) => ({
  kind,
  messageIds: Array.from({ length: Math.max(1, Number(count)) }, (_, i) => `removed-${i + 1}`),
});

const logOf = (r: Row) =>
  actionLogSchema.parse({
    schemaVersion: 1,
    id: r.id,
    workspaceId: r.workspace_id,
    actionId: r.action_id,
    idempotencyKey: r.idempotency_key,
    ...orUndefined("batchId", r.batch_id),
    outcome: r.outcome,
    command:
      r.command === null ? redactedCommand(r.command_kind, r.message_count) : json(r.command),
    inverse:
      r.inverse !== null
        ? json(r.inverse)
        : r.command === null && r.inverse_kind !== null
          ? redactedCommand(r.inverse_kind, r.message_count)
          : null,
    irreversible: flag(r.irreversible),
    ...orUndefined("irreversibleReason", r.irreversible_reason),
    ...orUndefined("errorCode", r.error_code),
    ...orUndefined("denialReason", r.denial_reason),
    at: r.at,
  });

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

const topicData = z.object({ data: z.string() });
const cursorToken = z.object({ token: z.string() });
const digestRow = z.object({ last_digest_at: z.iso.datetime() });
const countRow = z.object({ value: z.number() });
const categoryCountRow = z.object({ category: categorySchema, value: z.number() });

/** Statements and logic of every repository, bound to one connection. */
export function createSqliteCore(db: Database) {
  const all = (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as Row[];
  const one = (sql: string, ...params: unknown[]) =>
    db.prepare(sql).get(...params) as Row | undefined;
  const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
  const atomic = <A extends unknown[], T>(fn: (...args: A) => T) => db.transaction(fn);

  /** Every table with an `account_id` column, except those handled on their own. */
  function accountScopedTables(): string[] {
    const names = all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'message_search%'",
    ).map((r) => text(r.name));
    return names.filter(
      (name) =>
        name !== "action_log" &&
        all(`PRAGMA table_info("${name}")`).some((c) => c.name === "account_id"),
    );
  }

  // ---- accounts ----
  const accounts = {
    get: (ws: string, id: string) =>
      find("Account", () => {
        const r = one("SELECT * FROM account WHERE workspace_id = ? AND id = ?", ws, id);
        return r === undefined ? undefined : accountOf(r);
      }),
    list: (ws: string) =>
      guard(() =>
        all("SELECT * FROM account WHERE workspace_id = ? ORDER BY id", ws).map(accountOf),
      ),
    save: (a: z.infer<typeof accountSchema>) =>
      guard(() => {
        const v = accountSchema.parse(a);
        run(
          `INSERT INTO account (workspace_id, id, provider, address, connected_at, granted_scopes) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (workspace_id, id) DO UPDATE SET provider = excluded.provider, address = excluded.address, connected_at = excluded.connected_at, granted_scopes = excluded.granted_scopes`,
          v.workspaceId,
          v.id,
          v.provider,
          v.address,
          v.connectedAt,
          JSON.stringify(v.grantedScopes),
        );
      }),
    /**
     * Deletes the account and everything scoped to it, children first (the FTS rows go with the
     * messages). Tables are found by their `account_id` column, so a table added later is purged
     * too: that includes the outbox and job rows that name the account. Action log entries are
     * anonymised instead (kind, outcome, date and counts stay; ids and labels go).
     */
    remove: (ws: string, id: string) =>
      guard(() =>
        atomic(() => {
          run(
            `DELETE FROM signal WHERE workspace_id = ? AND message_id IN
               (SELECT id FROM message WHERE workspace_id = ? AND account_id = ?)`,
            ws,
            ws,
            id,
          );
          for (const table of accountScopedTables())
            run(`DELETE FROM "${table}" WHERE workspace_id = ? AND account_id = ?`, ws, id);
          run("UPDATE removal_guard SET active = 1");
          try {
            run(
              `UPDATE action_log SET command = NULL, inverse = NULL WHERE workspace_id = ? AND account_id = ?`,
              ws,
              id,
            );
          } finally {
            run("UPDATE removal_guard SET active = 0");
          }
          run("DELETE FROM account WHERE workspace_id = ? AND id = ?", ws, id);
        })(),
      ),
  };

  // ---- messages and sender stats ----
  const nextSequence = db.prepare(
    "UPDATE ingest_counter SET value = value + 1 WHERE id = 1 RETURNING value",
  );
  const insertMessage = db.prepare(
    `INSERT INTO message (workspace_id, id, account_id, thread_id, sender, recipients, subject, snippet, received_at,
       has_list_unsubscribe, opened, topic_ids, suspicious_reasons, suspicious_confidence, category, ingest_seq)
     VALUES (@workspace_id, @id, @account_id, @thread_id, @sender, @recipients, @subject, @snippet, @received_at,
       @has_list_unsubscribe, @opened, @topic_ids, @suspicious_reasons, @suspicious_confidence, @category,
       @ingest_seq)`,
  );
  // Re-running with the same input changes nothing; category and ingest_seq are never overwritten.
  const updateMessage = db.prepare(
    `UPDATE message SET account_id = @account_id, thread_id = @thread_id, sender = @sender, recipients = @recipients,
       subject = @subject, snippet = @snippet, received_at = @received_at,
       has_list_unsubscribe = @has_list_unsubscribe, opened = @opened, topic_ids = @topic_ids,
       suspicious_reasons = @suspicious_reasons, suspicious_confidence = @suspicious_confidence
     WHERE workspace_id = @workspace_id AND id = @id
       AND (account_id IS NOT @account_id OR thread_id IS NOT @thread_id OR sender IS NOT @sender
         OR recipients IS NOT @recipients OR subject IS NOT @subject OR snippet IS NOT @snippet
         OR received_at IS NOT @received_at OR has_list_unsubscribe IS NOT @has_list_unsubscribe
         OR opened IS NOT @opened OR topic_ids IS NOT @topic_ids
         OR suspicious_reasons IS NOT @suspicious_reasons
         OR suspicious_confidence IS NOT @suspicious_confidence)`,
  );
  const bumpSender = db.prepare(
    `INSERT INTO sender_stats (workspace_id, account_id, address, message_count, opened_count, replied_count, last_message_at, vip)
     VALUES (?, ?, ?, 1, ?, 0, ?, 0)
     ON CONFLICT (workspace_id, account_id, address) DO UPDATE SET
       message_count = message_count + 1,
       opened_count = opened_count + excluded.opened_count,
       last_message_at = max(last_message_at, excluded.last_message_at)`,
  );
  const openedFlip = db.prepare(
    `UPDATE sender_stats SET opened_count = opened_count + ? WHERE workspace_id = ? AND account_id = ? AND address = ?`,
  );

  /** Recounts one sender from its messages (rare: a message moved sender, account or date). */
  function recountSender(ws: string, account: string, address: string) {
    const agg = one(
      `SELECT count(*) AS n, coalesce(sum(opened), 0) AS opened, max(received_at) AS last
       FROM message WHERE workspace_id = ? AND account_id = ? AND sender = ?`,
      ws,
      account,
      address,
    );
    if (agg === undefined || agg.n === 0) {
      run(
        `UPDATE sender_stats SET message_count = 0, opened_count = 0
         WHERE workspace_id = ? AND account_id = ? AND address = ?`,
        ws,
        account,
        address,
      );
      run(
        `DELETE FROM sender_stats WHERE workspace_id = ? AND account_id = ? AND address = ?
           AND message_count = 0 AND replied_count = 0 AND vip = 0`,
        ws,
        account,
        address,
      );
      return;
    }
    run(
      `INSERT INTO sender_stats (workspace_id, account_id, address, message_count, opened_count, replied_count, last_message_at, vip)
       VALUES (?, ?, ?, ?, ?, 0, ?, 0)
       ON CONFLICT (workspace_id, account_id, address) DO UPDATE SET
         message_count = excluded.message_count, opened_count = excluded.opened_count,
         last_message_at = excluded.last_message_at`,
      ws,
      account,
      address,
      agg.n,
      agg.opened,
      agg.last,
    );
  }

  const upsertBatch = atomic((batch: readonly IncomingMessage[]) => {
    for (const m of batch) {
      const bound = {
        workspace_id: m.workspaceId,
        id: m.id,
        account_id: m.accountId,
        thread_id: m.threadId,
        sender: m.from,
        recipients: JSON.stringify(m.to),
        subject: m.subject,
        snippet: m.snippet,
        received_at: m.receivedAt,
        has_list_unsubscribe: m.hasListUnsubscribe ? 1 : 0,
        opened: m.opened ? 1 : 0,
        topic_ids: JSON.stringify(m.topicIds),
        suspicious_reasons:
          m.suspicious === undefined ? null : JSON.stringify(m.suspicious.reasons),
        suspicious_confidence: m.suspicious === undefined ? null : m.suspicious.confidence,
      };
      const before = one(
        "SELECT account_id, sender, received_at, opened FROM message WHERE workspace_id = ? AND id = ?",
        m.workspaceId,
        m.id,
      );
      if (before === undefined) {
        const seq = countRow.parse(nextSequence.get()).value;
        insertMessage.run({ ...bound, category: DEFAULT_CATEGORY, ingest_seq: seq });
        bumpSender.run(m.workspaceId, m.accountId, m.from, bound.opened, m.receivedAt);
        continue;
      }
      if (updateMessage.run(bound).changes === 0) continue; // a replay of what is stored
      const moved =
        before.account_id !== m.accountId ||
        before.sender !== m.from ||
        before.received_at !== m.receivedAt;
      if (moved) {
        recountSender(m.workspaceId, String(before.account_id), String(before.sender));
        recountSender(m.workspaceId, m.accountId, m.from);
      } else if (before.opened !== bound.opened) {
        openedFlip.run(bound.opened - Number(before.opened), m.workspaceId, m.accountId, m.from);
      }
    }
  });

  const messages = {
    get: (ws: string, id: string) =>
      find("Message", () => {
        const r = one(
          `SELECT ${MESSAGE_COLUMNS} FROM message WHERE workspace_id = ? AND id = ?`,
          ws,
          id,
        );
        return r === undefined ? undefined : messageOf(r);
      }),
    query: (ws: string, q: MessageQuery) =>
      guard(() => {
        const where = ["workspace_id = ?", "account_id = ?"];
        const params: unknown[] = [ws, q.accountId];
        const filter = (sql: string, value: unknown) => {
          if (value === undefined) return;
          where.push(sql);
          params.push(value);
        };
        filter("category = ?", q.category);
        filter("sender = ?", q.senderAddress);
        filter("ingest_seq > ?", q.afterSequence);
        filter("ingest_seq <= ?", q.throughSequence);
        if (q.cursor !== undefined) {
          const [at, id] = decodeCursor(q.cursor, 2);
          where.push("(received_at < ? OR (received_at = ? AND id > ?))");
          params.push(at, at, id);
        }
        const limit = Math.max(1, Math.floor(q.limit));
        const rows = all(
          `SELECT ${MESSAGE_COLUMNS} FROM message WHERE ${where.join(" AND ")}
           ORDER BY received_at DESC, id ASC LIMIT ?`,
          ...params,
          limit + 1,
        );
        return page(rows, limit, messageOf, (r) => [text(r.received_at), text(r.id)]);
      }),
    latestSequence: (ws: string, account: string) =>
      guard(() => {
        const r = one(
          "SELECT coalesce(max(ingest_seq), 0) AS value FROM message WHERE workspace_id = ? AND account_id = ?",
          ws,
          account,
        );
        return countRow.parse(r).value;
      }),
    countByCategory: (ws: string, accountIds: readonly string[]) =>
      guard(() => {
        const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
          Category,
          number
        >;
        if (accountIds.length === 0) return counts;
        const marks = accountIds.map(() => "?").join(", ");
        const rows = all(
          `SELECT category, count(*) AS value FROM message WHERE workspace_id = ? AND account_id IN (${marks}) GROUP BY category`,
          ws,
          ...accountIds,
        );
        for (const r of rows) {
          const { category, value } = categoryCountRow.parse(r);
          counts[category] = value;
        }
        return counts;
      }),
    upsertMany: (batch: readonly IncomingMessage[], signal?: { readonly aborted: boolean }) =>
      guard(() => {
        for (let i = 0; i < batch.length; i += CHUNK) {
          if (signal?.aborted) return; // the unit of work rolls an aborted run back
          upsertBatch(batch.slice(i, i + CHUNK));
        }
      }),
    setCategory: (ws: string, id: string, category: Category) => {
      const r = guard(
        () =>
          run("UPDATE message SET category = ? WHERE workspace_id = ? AND id = ?", category, ws, id)
            .changes,
      );
      if (!r.ok) return r;
      return r.value === 0 ? err(new NotFound("Message")) : ok(undefined);
    },
  };

  /** Full-text search over sender, subject, snippet, category and signals, best match first. */
  function search(ws: string, accountId: string, query: string, limit: number) {
    return guard((): Message[] => {
      // Control characters (NUL truncates the match string) are separators, never part of a term.
      const terms = query
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
        .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
        .split(/\s+/)
        .filter((t) => t !== "")
        .map((t) => `"${t.replaceAll('"', '""')}"`);
      if (terms.length === 0) return [];
      const last = terms.length - 1;
      terms[last] = `${terms[last]}*`; // type-ahead: the last word may be a prefix
      return all(
        `SELECT ${MESSAGE_COLUMNS.split(", ")
          .map((c) => `m.${c}`)
          .join(", ")}
         FROM message_search s JOIN message m ON m.rowid = s.rowid
         WHERE message_search MATCH ? AND m.workspace_id = ? AND m.account_id = ?
         ORDER BY s.rank LIMIT ?`,
        terms.join(" "),
        ws,
        accountId,
        Math.max(1, Math.floor(limit)),
      ).map(messageOf);
    });
  }

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
          JSON.stringify(v.command),
          JSON.stringify(v.reasons),
        );
      }),
  };

  // ---- action log (append-only: triggers refuse update and delete) ----
  const logs = (where: string, ...params: unknown[]) =>
    guard(() =>
      all(
        `SELECT * FROM action_log WHERE workspace_id = ? AND ${where} ORDER BY at, seq`,
        ...params,
      ).map(logOf),
    );
  const actionLog = {
    get: (ws: string, id: string) =>
      find("Action log entry", () => {
        const r = one("SELECT * FROM action_log WHERE workspace_id = ? AND id = ?", ws, id);
        return r === undefined ? undefined : logOf(r);
      }),
    listForAction: (ws: string, actionId: string) => logs("action_id = ?", ws, actionId),
    listForKey: (ws: string, key: string) => logs("idempotency_key = ?", ws, key),
    listForBatch: (ws: string, batchId: string) => logs("batch_id = ?", ws, batchId),
    list: (ws: string, p: { limit: number; cursor?: string }) =>
      guard(() => {
        const after = p.cursor === undefined ? undefined : decodeCursor(p.cursor, 1)[0];
        const limit = Math.max(1, Math.floor(p.limit));
        const rows = all(
          `SELECT * FROM action_log WHERE workspace_id = ? ${after === undefined ? "" : "AND seq > ?"}
           ORDER BY seq LIMIT ?`,
          ws,
          ...(after === undefined ? [] : [after]),
          limit + 1,
        );
        return page(rows, limit, logOf, (r) => [num(r.seq)]);
      }),
    append: (e: z.infer<typeof actionLogSchema>) =>
      guard(() => {
        const v = actionLogSchema.parse(e);
        const owner = one(
          "SELECT account_id FROM message WHERE workspace_id = ? AND id = ?",
          v.workspaceId,
          v.command.messageIds[0],
        );
        // A plain INSERT: an id that already exists fails instead of rewriting history.
        run(
          `INSERT INTO action_log (workspace_id, id, action_id, idempotency_key, batch_id, outcome, account_id,
             command_kind, message_count, inverse_kind, command, inverse,
             irreversible, irreversible_reason, error_code, denial_reason, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          v.workspaceId,
          v.id,
          v.actionId,
          v.idempotencyKey,
          v.batchId ?? null,
          v.outcome,
          owner === undefined ? null : text(owner.account_id),
          v.command.kind,
          v.command.messageIds.length,
          v.inverse === null ? null : v.inverse.kind,
          JSON.stringify(v.command),
          v.inverse === null ? null : JSON.stringify(v.inverse),
          v.irreversible ? 1 : 0,
          v.irreversibleReason ?? null,
          v.errorCode ?? null,
          v.denialReason ?? null,
          v.at,
        );
      }),
  };

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

  return {
    accounts,
    messages,
    threads,
    derived,
    senders,
    suggestions,
    actionLog,
    topics,
    cursors,
    signals,
    digestState,
    search,
  };
}
