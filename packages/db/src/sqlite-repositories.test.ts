import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Category } from "@pochimail/core/domain/category";
import type { IncomingMessage } from "@pochimail/core/domain/mail";
import { AiUnavailable, type ProviderError } from "@pochimail/core/errors";
import type { AccountId, MessageId } from "@pochimail/core/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import { derivedContract, makeDerived } from "@pochimail/testing/derived-contract";
import { digestStateContract } from "@pochimail/testing/digest-state-contract";
import { entityRoundTripContract } from "@pochimail/testing/entity-contract";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import {
  ACCOUNT_1,
  makeAccount,
  makeActionLog,
  makeIncomingMessage,
  makeSuggestion,
  makeThread,
  WS_A,
} from "@pochimail/testing/fixtures";
import { createGroundTruthClassifier } from "@pochimail/testing/ground-truth-classifier";
import { createInMemorySecretStore } from "@pochimail/testing/in-memory-secret-store";
import { insightContract } from "@pochimail/testing/insight-contract";
import { repositoriesContract } from "@pochimail/testing/repositories-contract";
import {
  makeSignal,
  signalRepositoryContract,
} from "@pochimail/testing/signal-repository-contract";
import { runSyncContract } from "@pochimail/testing/sync-contract";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { openStorage, type Storage } from "./open-storage.ts";
import { createSqliteCore } from "./sqlite-core.ts";
import { createSqliteJobQueue } from "./sqlite-job-queue.ts";
import { createSqliteUnitOfWork } from "./sqlite-unit-of-work.ts";

const dirs: string[] = [];
const opened: Storage[] = [];
function open(): Storage {
  const dir = mkdtempSync(join(tmpdir(), "pochimail-repos-"));
  dirs.push(dir);
  const storage = unwrap(openStorage(join(dir, "pochimail.db"), Buffer.alloc(32, 3)));
  opened.push(storage);
  return storage;
}
afterEach(() => {
  for (const s of opened.splice(0)) {
    try {
      s.close();
    } catch {
      // already closed by the test
    }
  }
  for (const d of dirs.splice(0))
    rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const TABLE_KEYS: Record<string, string> = {
  account: "accounts",
  message: "messages",
  thread: "threads",
  sender_stats: "senders",
  suggestion: "suggestions",
  signal: "signals",
  action_log: "actionLog",
  cursor: "cursors",
  topic: "topics",
  digest_state: "digestState",
};

/** Every committed row of every table and the outbox, as plain data. */
function harness() {
  const storage = open();
  const sqlite = createSqliteUnitOfWork(storage);
  const committedOutbox = async () =>
    unwrap(await sqlite.outboxStore.pending(100_000)).map((r) => r.entry);
  const snapshot = async () => {
    const tables = storage.reader
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'message_search%' AND name NOT IN ('outbox', 'job')",
      )
      .all() as { name: string }[];
    const out: Record<string, unknown> = {};
    for (const { name } of tables)
      out[TABLE_KEYS[name] ?? name] = storage.reader.prepare(`SELECT * FROM "${name}"`).all();
    out.outbox = await committedOutbox();
    return out;
  };
  return { storage, ...sqlite, committedOutbox, snapshot };
}
const uowHarness = () => {
  const h = harness();
  return { uow: h.uow, committedOutbox: h.committedOutbox };
};

// Every exported repository contract suite, unchanged, against SQLite (none skipped).
repositoriesContract(uowHarness);
derivedContract(uowHarness);
signalRepositoryContract(uowHarness);
digestStateContract(uowHarness);
insightContract(() => {
  const h = harness();
  const labels = new Map<string, Category>();
  return {
    uow: h.uow,
    clock: createFakeClock(),
    classifier: createGroundTruthClassifier(labels),
    labels,
    snapshot: h.snapshot,
  };
});
runSyncContract(() => {
  const h = harness();
  const provider = createFakeMailProvider({ pageSize: 2 });
  const labels = new Map<string, Category>();
  const classifier = createGroundTruthClassifier(labels);
  let next = 0;
  return {
    uow: h.uow,
    secrets: createInMemorySecretStore(),
    provider,
    clock: createFakeClock(),
    ids: { next: (prefix: string) => `${prefix}_${++next}` },
    labels,
    classifier,
    makeClassifierUnavailable: () => classifier.faults.failWith(new AiUnavailable(), { times: 1 }),
    deliver: provider.deliver,
    setBody: provider.setBody,
    failNextSync: (error: ProviderError) => provider.faults.failWith(error, { times: 1 }),
    snapshot: h.snapshot,
    committedOutbox: h.committedOutbox,
  };
});

// Entities stored by a repository go through a real (in-memory) encrypted-free SQLite round trip;
// attachments and actions have no table by design (D11: attachments go to the blob store, M6).
function sqliteRoundTrip() {
  // One database for the whole entity suite, closed once it is done (Windows holds file locks).
  let shared:
    | { storage: Storage; core: ReturnType<typeof createSqliteCore>; dir: string }
    | undefined;
  afterAll(() => {
    shared?.storage.close();
    if (shared)
      rmSync(shared.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const connect = () => {
    if (shared === undefined) {
      const dir = mkdtempSync(join(tmpdir(), "pochimail-entities-"));
      const storage = unwrap(openStorage(join(dir, "pochimail.db"), Buffer.alloc(32, 4)));
      shared = { storage, core: createSqliteCore(storage.writer), dir };
    }
    return shared.core;
  };
  let counter = 0;
  const done = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  return (value: unknown): unknown => {
    const v = value as Record<string, unknown>;
    const core = connect();
    counter++;
    if (
      "filename" in v ||
      "suggestionId" in v ||
      ("command" in v && "idempotencyKey" in v && !("outcome" in v))
    )
      return JSON.parse(JSON.stringify(value)); // not persisted by any repository
    if ("provider" in v) {
      done(core.accounts.save(v as never));
      return done(core.accounts.get(String(v.workspaceId), String(v.id)));
    }
    if ("from" in v) {
      const m = v as unknown as IncomingMessage & { category?: Category };
      done(core.messages.upsertMany([m]));
      if (m.category !== undefined)
        done(core.messages.setCategory(m.workspaceId, m.id, m.category));
      return done(core.messages.get(m.workspaceId, m.id));
    }
    if ("messageIds" in v && "lastMessageAt" in v) {
      done(core.threads.upsert(v as never));
      return done(core.threads.get(String(v.workspaceId), String(v.id)));
    }
    if ("messageCount" in v) {
      done(core.senders.upsert(v as never));
      return done(core.senders.get(String(v.workspaceId), String(v.accountId), String(v.address)));
    }
    if ("reasons" in v && "state" in v) {
      done(core.suggestions.save(v as never));
      return done(core.suggestions.get(String(v.workspaceId), String(v.id)));
    }
    if ("kind" in v && "detectedAt" in v) {
      const id = `${String(v.messageId)}#${counter}`;
      const signal = { ...v, messageId: id, reason: "test" } as never;
      done(core.signals.replaceForMessages(String(v.workspaceId), [id], [signal]));
      return {
        ...done(core.signals.listForMessages(String(v.workspaceId), [id]))[0],
        messageId: v.messageId,
      };
    }
    if ("outcome" in v) {
      done(core.actionLog.append(v as never));
      return done(core.actionLog.get(String(v.workspaceId), String(v.id)));
    }
    if ("name" in v) {
      done(core.topics.save(v as never));
      return done(core.topics.get(String(v.workspaceId), String(v.id)));
    }
    throw new Error("unknown entity");
  };
}
entityRoundTripContract(sqliteRoundTrip());

const T0 = Date.UTC(2026, 0, 1);
const sender = (n: number) => `sender${n}@example.com`;
const mail = (n: number, over: Partial<IncomingMessage> = {}) =>
  makeIncomingMessage(n, { receivedAt: new Date(T0 + n * 60_000).toISOString(), ...over });

async function put(h: ReturnType<typeof harness>, messages: IncomingMessage[]) {
  const r = await h.uow.run(async (tx) => {
    for (let i = 0; i < messages.length; i += 1000)
      unwrap(await tx.repositories.messages.upsertMany(messages.slice(i, i + 1000)));
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

describe("D11: no mail content at rest (ADR 0009)", () => {
  it("no table or column is named or typed to hold a message body or attachment bytes (guards a schema that can store mail text)", () => {
    const { storage } = harness();
    const tables = storage.reader
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'message_search_%'",
      )
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThan(10);
    const forbidden =
      /(^|[^a-z])(body|bodies|html|text|content|contents|raw|mime|attachment|attachments|blob|bytes|file|eml)([^a-z]|$)/;
    const offenders: string[] = [];
    for (const { name } of tables) {
      if (forbidden.test(name.toLowerCase())) offenders.push(name);
      const columns = storage.reader.prepare(`PRAGMA table_xinfo("${name}")`).all() as {
        name: string;
        type: string;
        hidden: number;
      }[];
      // The FTS5 table's own hidden columns (table name, rank) are not data; its real columns
      // are pinned by the next test.
      for (const c of columns.filter((x) => x.hidden === 0 && name !== "message_search")) {
        const words = c.name
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/[^a-z0-9]+/);
        if (words.some((w) => forbidden.test(w)) || /blob|any/i.test(c.type) || c.type === "")
          offenders.push(`${name}.${c.name}:${c.type}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the full-text index covers exactly sender, subject, snippet, category and signals (guards indexing anything else)", () => {
    const { storage } = harness();
    const columns = (
      storage.reader.prepare('PRAGMA table_xinfo("message_search")').all() as {
        name: string;
        hidden: number;
      }[]
    )
      .filter((c) => c.hidden === 0)
      .map((c) => c.name);
    expect(columns).toEqual(["sender", "subject", "snippet", "category", "signals"]);
  });

  it("refuses a snippet longer than the cap, so a body cannot be stored in it (guards bodies hidden in snippets)", async () => {
    const h = harness();
    const r = await h.uow.run(async (tx) =>
      tx.repositories.messages.upsertMany([mail(1, { snippet: "x".repeat(5000) })]),
    );
    expect(r.ok).toBe(false);
    expect(
      unwrap(await h.uow.reads.messages.query(WS_A, { accountId: ACCOUNT_1, limit: 5 })).items,
    ).toEqual([]);
  });
});

describe("sender stats", () => {
  it("equal a full recount after a mixed upsert, replay, open and move sequence (guards drifting incremental counters)", async () => {
    const h = harness();
    const batch = [1, 2, 3, 4, 5, 6].map((n) => mail(n, { from: sender(n % 3) }));
    await put(h, batch);
    await put(h, batch); // replay: changes nothing
    await put(h, [mail(2, { from: sender(2), opened: true })]); // opened later
    await put(h, [mail(3, { from: sender(2) })]); // moved to another sender
    await put(h, [
      mail(4, { from: sender(1), receivedAt: new Date(T0 + 99 * 60_000).toISOString() }),
    ]);
    await put(h, [
      mail(7, { from: sender(1), opened: true }),
      mail(7, { from: sender(1), opened: false }),
    ]);

    const stats = unwrap(await h.uow.reads.senders.list(WS_A, ACCOUNT_1, { limit: 100 })).items;
    const recount = h.storage.reader
      .prepare(
        "SELECT sender AS address, count(*) AS n, sum(opened) AS opened, max(received_at) AS last FROM message GROUP BY sender ORDER BY sender",
      )
      .all() as { address: string; n: number; opened: number; last: string }[];
    expect(stats.map((s) => [s.address, s.messageCount, s.openedCount, s.lastMessageAt])).toEqual(
      recount.map((r) => [r.address, r.n, r.opened, r.last]),
    );
    expect(stats.reduce((n, s) => n + s.messageCount, 0)).toBe(7);
  });

  it("keep the VIP flag and replied count that the stats row already had (guards a re-sync wiping user knowledge)", async () => {
    const h = harness();
    await put(h, [mail(1, { from: sender(1) })]);
    const current = unwrap(await h.uow.reads.senders.get(WS_A, ACCOUNT_1, sender(1)));
    await h.uow.run(async (tx) =>
      tx.repositories.senders.upsert({ ...current, vip: true, repliedCount: 4 }),
    );
    await put(h, [mail(2, { from: sender(1) })]);
    const after = unwrap(await h.uow.reads.senders.get(WS_A, ACCOUNT_1, sender(1)));
    expect([after.messageCount, after.vip, after.repliedCount]).toEqual([2, true, 4]);
  });
});

describe("account removal", () => {
  it("removes the search entries and signals of that account only (guards ghost search hits after removal)", async () => {
    const h = harness();
    const other = "acc-2" as AccountId;
    await h.uow.run(async (tx) => {
      await tx.repositories.accounts.save(makeAccount());
      await tx.repositories.accounts.save(makeAccount({ id: other, address: "two@example.com" }));
      return ok(undefined);
    });
    await put(h, [
      mail(1, { subject: "Invoice april" }),
      mail(2, { subject: "Invoice april", accountId: other }),
    ]);
    await h.uow.run(async (tx) => {
      await tx.repositories.signals.replaceForMessages(
        WS_A,
        ["msg-1" as MessageId, "msg-2" as MessageId],
        ["msg-1", "msg-2"].map((id) => ({
          schemaVersion: 1 as const,
          workspaceId: WS_A,
          messageId: id as MessageId,
          kind: "has-document" as const,
          confidence: 0.9,
          detectedAt: "2026-01-01T00:00:00.000Z",
          reason: "A document is attached",
        })),
      );
      return ok(undefined);
    });
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, ACCOUNT_1));
    const hits = () =>
      h.storage.reader
        .prepare("SELECT count(*) AS n FROM message_search WHERE message_search MATCH 'invoice'")
        .get() as { n: number } & { account?: AccountId };
    expect(hits().n).toBe(1);
    const signals = h.storage.reader.prepare("SELECT message_id FROM signal").all();
    expect(signals).toEqual([{ message_id: "msg-2" }]);
    const found = unwrap(await h.search.search(WS_A, other, "invoice", 10));
    expect(found.map((m) => m.id)).toEqual(["msg-2"]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "invoice", 10))).toEqual([]);
  });
});

describe("full-text search", () => {
  it("finds by subject, sender, snippet prefix, category and signal, and not by a word that was never stored (guards wrong matches; the body guarantee is the schema tests above)", async () => {
    const h = harness();
    const BODY = "zanzibarquartz";
    await put(h, [
      mail(1, { subject: "Quarterly invoice", from: "billing@acme.example" }),
      mail(2, { subject: "Lunch?", snippet: "short preview" }),
    ]);
    // A provider body would only ever exist in memory; nothing in the schema can take it.
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "invoice", 10)).map((m) => m.id)).toEqual([
      "msg-1",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "acme", 10)).map((m) => m.id)).toEqual([
      "msg-1",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "prev", 10)).map((m) => m.id)).toEqual([
      "msg-2",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, BODY, 10))).toEqual([]);
    expect(unwrap(await h.search.search(WS_B_ID, ACCOUNT_1, "invoice", 10))).toEqual([]);
    // Query syntax typed by a user is data, not FTS5 operators.
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, 'invoice" OR "', 10))).toEqual([]);
  });

  it("follows a category change and replaced signals (guards a stale index)", async () => {
    const h = harness();
    await put(h, [mail(1, { subject: "Hello" })]);
    await h.uow.run((tx) =>
      tx.repositories.messages.setCategory(WS_A, "msg-1" as MessageId, "promotions"),
    );
    await h.uow.run(async (tx) => {
      await tx.repositories.signals.replaceForMessages(
        WS_A,
        ["msg-1" as MessageId],
        [
          {
            schemaVersion: 1,
            workspaceId: WS_A,
            messageId: "msg-1" as MessageId,
            kind: "time-sensitive",
            confidence: 0.7,
            detectedAt: "2026-01-01T00:00:00.000Z",
            reason: "A deadline is near",
          },
        ],
      );
      return ok(undefined);
    });
    const ids = async (q: string) =>
      unwrap(await h.search.search(WS_A, ACCOUNT_1, q, 5)).map((m) => m.id);
    expect(await ids("promotions")).toEqual(["msg-1"]);
    expect(await ids("time-sensitive")).toEqual(["msg-1"]);
    await h.uow.run(async (tx) =>
      tx.repositories.signals.replaceForMessages(WS_A, ["msg-1" as MessageId], []),
    );
    expect(await ids("time-sensitive")).toEqual([]);
  });
});

const WS_B_ID = "ws-b" as typeof WS_A;

describe("digest cursor", () => {
  it("stays after a removed account's mail, so new mail is never skipped (guards sequence reuse after deletes)", async () => {
    const h = harness();
    const other = "acc-2" as AccountId;
    await put(h, [mail(1), mail(2, { accountId: other }), mail(3, { accountId: other })]);
    const before = unwrap(await h.uow.reads.messages.latestSequence(WS_A, ACCOUNT_1));
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, other));
    await put(h, [mail(4)]);
    const after = unwrap(await h.uow.reads.messages.latestSequence(WS_A, ACCOUNT_1));
    expect(after).toBeGreaterThan(3);
    expect(after).toBeGreaterThan(before);
  });
});

describe("100,000 messages", () => {
  it("keeps indexed top-50 and sender GROUP BY inside their budgets and finds by subject (guards a missing index or full scans)", {
    timeout: 120_000,
  }, async () => {
    const h = harness();
    const categories: Category[] = ["people", "newsletters", "promotions", "records"];
    const t0 = performance.now();
    const batch: IncomingMessage[] = [];
    for (let n = 1; n <= 100_000; n++)
      batch.push(
        mail(n, {
          from: sender(n % 2000),
          subject: n === 77_777 ? "Needle in the haystack" : `Update ${n % 500}`,
          threadId: `thr-${n}` as never,
        }),
      );
    await put(h, batch);
    const insertMs = performance.now() - t0;
    await h.uow.run(async (tx) => {
      for (let n = 1; n <= 100_000; n += 7)
        await tx.repositories.messages.setCategory(
          WS_A,
          `msg-${n}` as MessageId,
          categories[n % 4] as Category,
        );
      return ok(undefined);
    });

    const time = async <T>(run: () => T | Promise<T>) => {
      const s = performance.now();
      const value = await run();
      return { ms: performance.now() - s, value };
    };
    const top = await time(() =>
      h.uow.reads.messages.query(WS_A, { accountId: ACCOUNT_1, category: "people", limit: 50 }),
    );
    const bySender = await time(
      () =>
        h.storage.reader
          .prepare(
            "SELECT sender, count(*) AS n FROM message WHERE workspace_id = ? AND account_id = ? GROUP BY sender ORDER BY n DESC LIMIT 50",
          )
          .all(WS_A, ACCOUNT_1) as unknown[],
    );
    const statsTop = await time(() => h.uow.reads.senders.list(WS_A, ACCOUNT_1, { limit: 50 }));
    const found = await time(() => h.search.search(WS_A, ACCOUNT_1, "needle", 10));
    const plan = h.storage.reader
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM message WHERE workspace_id = ? AND account_id = ? AND category = ? ORDER BY received_at DESC, id LIMIT 50",
      )
      .all(WS_A, ACCOUNT_1, "people") as { detail: string }[];
    process.stderr.write(
      `[M2-03 budgets] insert 100k ${insertMs.toFixed(0)} ms; top-50 ${top.ms.toFixed(1)} ms; sender GROUP BY ${bySender.ms.toFixed(1)} ms; stats list ${statsTop.ms.toFixed(1)} ms; FTS5 ${found.ms.toFixed(1)} ms\n`,
    );

    expect(unwrap(top.value).items).toHaveLength(50);
    expect(plan.map((p) => p.detail).join(" ")).toContain("message_by_category");
    expect(top.ms).toBeLessThan(100);
    expect(bySender.ms).toBeLessThan(1500);
    expect(statsTop.ms).toBeLessThan(100);
    expect(found.ms).toBeLessThan(200);
    expect(unwrap(found.value).map((m) => m.subject)).toEqual(["Needle in the haystack"]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "zanzibarquartz", 10))).toEqual([]);
  });
});

const stamp = "2026-01-01T00:00:00.000Z";

describe("account removal: events, jobs, log and schema coverage", () => {
  it("purges the removed account's pending jobs and outbox rows and keeps the other account's (guards a removed account being synced again)", async () => {
    const h = harness();
    const queue = createSqliteJobQueue(h.storage, createFakeClock());
    const other = "acc-2" as AccountId;
    for (const [account, key] of [
      [ACCOUNT_1, "sync-1"],
      [other, "sync-2"],
    ] as const)
      unwrap(
        await queue.enqueue(WS_A, {
          type: "sync",
          payload: { accountId: account },
          idempotencyKey: key,
        }),
      );
    await h.uow.run(async (tx) => {
      await tx.outbox.append({
        kind: "job",
        workspaceId: WS_A,
        job: { type: "sync", payload: { accountId: ACCOUNT_1 }, idempotencyKey: "relay-1" },
      });
      return ok(undefined);
    });
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, ACCOUNT_1));
    const keys = h.storage.reader.prepare("SELECT idempotency_key FROM job").all();
    expect(keys).toEqual([{ idempotency_key: "sync-2" }]);
    expect(h.storage.reader.prepare("SELECT count(*) AS n FROM outbox").get()).toEqual({ n: 0 });
  });

  it("anonymises log entries in place and still refuses any other edit or delete (guards a rewritable audit trail)", async () => {
    const h = harness();
    await put(h, [mail(1)]);
    await h.uow.run((tx) => tx.repositories.actionLog.append(makeActionLog(1)));
    const before = h.storage.reader.prepare("SELECT seq, outcome, at FROM action_log").all();
    for (const sql of [
      "UPDATE action_log SET outcome = 'undone'",
      "UPDATE action_log SET command = NULL, inverse = NULL",
      "DELETE FROM action_log",
    ])
      expect(() => h.storage.writer.prepare(sql).run()).toThrow(/append-only/);
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, ACCOUNT_1));
    expect(h.storage.reader.prepare("SELECT seq, outcome, at FROM action_log").all()).toEqual(
      before,
    );
    const entry = unwrap(await h.uow.reads.actionLog.get(WS_A, makeActionLog(1).id));
    expect(entry.command).toEqual({ kind: "archive", messageIds: ["removed-1"] });
    expect(() =>
      h.storage.writer.prepare("UPDATE action_log SET outcome = 'undone'").run(),
    ).toThrow(/append-only/);
  });

  it("covers every table that has an account_id column, including one added later (guards a new account-scoped table surviving removal)", async () => {
    const h = harness();
    const scoped = () =>
      (
        h.storage.reader
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as { name: string }[]
      )
        .filter(({ name }) =>
          (
            h.storage.reader.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]
          ).some((c) => c.name === "account_id"),
        )
        .map(({ name }) => name)
        .sort();
    // Adding an account-scoped table means adding it here on purpose; remove() finds it on its own.
    expect(scoped()).toEqual([
      "action_log",
      "cursor",
      "derived",
      "digest_state",
      "job",
      "message",
      "outbox",
      "sender_stats",
      "suggestion",
      "thread",
    ]);
    h.storage.writer.exec(
      "CREATE TABLE later_scoped (workspace_id TEXT NOT NULL, account_id TEXT NOT NULL, note TEXT) STRICT",
    );
    h.storage.writer
      .prepare("INSERT INTO later_scoped VALUES (?, ?, 'x'), (?, 'acc-2', 'y')")
      .run(WS_A, ACCOUNT_1, WS_A);
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, ACCOUNT_1));
    expect(h.storage.reader.prepare("SELECT account_id FROM later_scoped").all()).toEqual([
      { account_id: "acc-2" },
    ]);
  });
});

describe("free-text caps (D11: a body cannot hide in a reason or subject)", () => {
  const long = (n: number) => "x".repeat(n);
  const cases: [string, (h: ReturnType<typeof harness>) => Promise<{ ok: boolean }>][] = [
    [
      "derived.reason",
      (h) => h.uow.run((tx) => tx.repositories.derived.save(makeDerived(1, { reason: long(501) }))),
    ],
    [
      "signal.reason",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.signals.replaceForMessages(
            WS_A,
            ["msg-1" as MessageId],
            [makeSignal(1, { reason: long(501) })],
          ),
        ),
    ],
    [
      "suggestion.reasons",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.suggestions.save(makeSuggestion({ reasons: [long(2001)] })),
        ),
    ],
    [
      "message.suspicious_reasons",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.messages.upsertMany([
            mail(1, { suspicious: { reasons: [long(2001)], confidence: 0.5 } }),
          ]),
        ),
    ],
    [
      "thread.subject",
      (h) => h.uow.run((tx) => tx.repositories.threads.upsert(makeThread({ subject: long(4001) }))),
    ],
  ];
  it.each(cases)(
    "refuses an over-long %s (guards unbounded text in that column)",
    async (_c, attempt) => {
      expect((await attempt(harness())).ok).toBe(false);
    },
  );
});

describe("search input", () => {
  it("treats NUL and other control characters as separators and never throws (guards a hostile search box breaking search)", async () => {
    const h = harness();
    await put(h, [mail(1, { subject: "Quarterly invoice" })]);
    const ids = async (q: string) =>
      unwrap(await h.search.search(WS_A, ACCOUNT_1, q, 5)).map((m) => m.id);
    expect(await ids("invoice\u0000junk")).toEqual([]);
    expect(await ids("quarterly\u0000invoice")).toEqual(["msg-1"]);
    expect(await ids("\u0000")).toEqual([]);
    expect(await ids("\u0001\u001f invoice")).toEqual(["msg-1"]);
  });
});

describe("digest state", () => {
  it("keeps the covered sequence when only the date is set (guards re-reporting everything after a 3-argument call)", async () => {
    const h = harness();
    await h.uow.run((tx) => tx.repositories.digestState.set(WS_A, ACCOUNT_1, stamp, 7));
    await h.uow.run((tx) =>
      tx.repositories.digestState.set(WS_A, ACCOUNT_1, "2026-01-02T00:00:00.000Z"),
    );
    expect(unwrap(await h.uow.reads.digestState.getSequence(WS_A, ACCOUNT_1))).toBe(7);
  });
});
