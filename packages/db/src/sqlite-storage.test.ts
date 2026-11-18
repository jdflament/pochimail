import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageError } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import { createOutboxRelay } from "@pochimail/core/jobs/outbox-relay";
import type { BusEvent, EventBus } from "@pochimail/core/ports/event-bus";
import { err, ok, unwrap } from "@pochimail/core/result";
import { failingChecks } from "@pochimail/testing/contract";
import { sampleEvent } from "@pochimail/testing/event-samples";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { jobQueueContract } from "@pochimail/testing/job-queue-contract";
import { runJobQueueContract } from "@pochimail/testing/job-queue-lease-contract";
import { runOutboxContract } from "@pochimail/testing/outbox-contract";
import { runPipelineContract } from "@pochimail/testing/pipeline-contract";
import { unitOfWorkChecks, unitOfWorkContract } from "@pochimail/testing/unit-of-work-contract";
import Database from "better-sqlite3-multiple-ciphers";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "./migrator.ts";
import { isPlainSqliteFile, openStorage, type Storage } from "./open-storage.ts";
import { pruneStorage } from "./prune.ts";
import { createSqliteJobQueue } from "./sqlite-job-queue.ts";
import { createSqliteUnitOfWork } from "./sqlite-unit-of-work.ts";

const dirs: string[] = [];
const opened: Storage[] = [];
const key = (n: number) => Buffer.alloc(32, n);
const freshPath = () => {
  const dir = mkdtempSync(join(tmpdir(), "pochimail-db-"));
  dirs.push(dir);
  return join(dir, "pochimail.db");
};
function open(path = freshPath(), k = key(1)) {
  const storage = unwrap(openStorage(path, k));
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

function sqliteUnitOfWorkHarness() {
  const { uow, outboxStore } = createSqliteUnitOfWork(open());
  return {
    uow,
    committedOutbox: async () => unwrap(await outboxStore.pending(1000)).map((r) => r.entry),
  };
}
const queueHarness = (leaseMs = 10_000) => {
  const storage = open();
  const clock = createFakeClock();
  const queue = createSqliteJobQueue(storage, clock, { leaseMs });
  return { storage, clock, queue, leaseMs };
};

// The exported M1 contract suites, unchanged, against SQLite.
unitOfWorkContract(sqliteUnitOfWorkHarness);
jobQueueContract(() => queueHarness());
runJobQueueContract(() => {
  const h = queueHarness();
  return { ...h, deadLetters: async () => h.queue.deadLetters() };
});
runOutboxContract(() => {
  const storage = open();
  const { uow, outboxStore } = createSqliteUnitOfWork(storage);
  return { uow, store: outboxStore, queue: createSqliteJobQueue(storage, createFakeClock()) };
});

runPipelineContract(() => {
  const h = queueHarness();
  const { uow } = createSqliteUnitOfWork(h.storage);
  return {
    queue: h.queue,
    clock: h.clock,
    cursors: {
      get: uow.reads.cursors.get,
      set: async (w, a, c) => {
        const r = await uow.run(async (tx) => tx.repositories.cursors.set(w, a, c));
        return r.ok ? r : err(new StorageError());
      },
    },
    deadLetters: async () => h.queue.deadLetters().map((d) => ({ jobId: d.jobId })),
  };
});

// The repository contracts (all of them, none skipped) run in sqlite-repositories.test.ts.

const ws = "w-1" as WorkspaceId;
const recordingBus = () => {
  const published: string[] = [];
  const bus: EventBus<BusEvent> = {
    async publish(e) {
      published.push(e.id);
      return ok(undefined);
    },
    subscribe: () => () => {},
  };
  return { bus, published };
};

describe("encrypted storage", () => {
  it("rejects a wrong key and leaves no plain SQLite header (guards an unencrypted or key-ignoring database)", () => {
    const path = freshPath();
    open(path, key(1)).close();
    expect(isPlainSqliteFile(path)).toBe(false);
    const wrong = openStorage(path, key(2));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.code).toBe("storage.failed");
      expect(wrong.error.message).toBe("Could not open the database (wrong key or damaged file)");
    }
    expect(open(path, key(1))).toBeDefined();
  });

  it("refuses a key that is not 32 bytes (guards silently weak keys)", () => {
    expect(openStorage(freshPath(), Buffer.alloc(16, 1)).ok).toBe(false);
  });
});

describe("encrypted storage refusals", () => {
  it("refuses a plain unencrypted SQLite file (guards silently reading or adopting a plaintext database)", () => {
    const path = freshPath();
    const plain = new Database(path);
    plain.exec("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1)");
    plain.close();
    expect(openStorage(path, key(1)).ok).toBe(false);
  });

  it("never puts the key or its hex in an error message or cause (guards key leaks into logs)", () => {
    const path = freshPath();
    open(path, key(1)).close();
    const secret = key(7);
    const failure = openStorage(path, secret);
    expect(failure.ok).toBe(false);
    if (failure.ok) return;
    const text = `${failure.error.message} ${failure.error.stack} ${String(failure.error.cause)}`;
    expect(text).not.toContain(secret.toString("hex"));
    expect(text).not.toContain(key(1).toString("hex"));
    const short = openStorage(freshPath(), Buffer.alloc(16, 9));
    if (!short.ok) expect(short.error.message).not.toContain(Buffer.alloc(16, 9).toString("hex"));
  });
});

describe("re-entrancy", () => {
  it("answers an error instead of hanging when the queue or a nested run is used inside a transaction (guards a worker deadlock)", async () => {
    const h = queueHarness();
    const { uow } = createSqliteUnitOfWork(h.storage);
    const seen: boolean[] = [];
    const r = await uow.run(async () => {
      const queued = await h.queue.enqueue(ws, { type: "sync", payload: {}, idempotencyKey: "k" });
      const nested = await uow.run(async () => ok(1));
      seen.push(queued.ok, nested.ok);
      return ok("done");
    });
    expect(r).toEqual(ok("done"));
    expect(seen).toEqual([false, false]);
    expect((await h.queue.enqueue(ws, { type: "sync", payload: {}, idempotencyKey: "k" })).ok).toBe(
      true,
    );
  });
});

describe("job entries in the outbox", () => {
  it("hands a job appended in a transaction to the queue once after a crash and reopen (guards jobs lost between commit and relay)", async () => {
    const path = freshPath();
    const { uow } = createSqliteUnitOfWork(open(path));
    await uow.run(async (tx) => {
      await tx.outbox.append({
        kind: "job",
        workspaceId: ws,
        job: { type: "classify", payload: { page: 1 }, idempotencyKey: "classify-1" },
      });
      return ok(undefined);
    });
    const after = open(path);
    const { outboxStore } = createSqliteUnitOfWork(after);
    const queue = createSqliteJobQueue(after, createFakeClock());
    const { bus } = recordingBus();
    const relay = createOutboxRelay({ store: outboxStore, bus, queue });
    expect(unwrap(await relay.drain()).delivered).toBe(1);
    expect(unwrap(await relay.drain()).delivered).toBe(0);
    const never = new AbortController().signal;
    expect(unwrap(await queue.claim(["classify"], never))?.payload).toEqual({ page: 1 });
    expect(unwrap(await queue.claim(["classify"], never))).toBeNull();
  });
});

describe("D11: no mail content in the outbox or queue", () => {
  const bad = [
    { body: "hello" },
    { nested: { htmlBody: "<p>x</p>" } },
    { items: [{ attachment_name: "a.pdf" }] },
    { Text: "plain" },
  ];
  it.each(bad)(
    "rejects a payload with a mail-content key %j (guards bodies persisting forever)",
    async (payload) => {
      const h = queueHarness();
      const { uow } = createSqliteUnitOfWork(h.storage);
      expect((await h.queue.enqueue(ws, { type: "t", payload, idempotencyKey: "k" })).ok).toBe(
        false,
      );
      const r = await uow.run(async (tx) =>
        tx.outbox.append({
          kind: "job",
          workspaceId: ws,
          job: { type: "t", payload, idempotencyKey: "k" },
        }),
      );
      expect(r.ok).toBe(false);
    },
  );

  it("rejects an oversized payload but accepts ids and cursors (guards unbounded rows)", async () => {
    const h = queueHarness();
    expect(
      (
        await h.queue.enqueue(ws, {
          type: "t",
          payload: { cursor: "x".repeat(20_000) },
          idempotencyKey: "big",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await h.queue.enqueue(ws, {
          type: "t",
          payload: { context: "c", messageIds: ["m1"] },
          idempotencyKey: "ok",
        })
      ).ok,
    ).toBe(true);
  });

  it("prunes delivered outbox rows and finished jobs but keeps pending work (guards unbounded growth)", async () => {
    const h = queueHarness();
    const clock = h.clock;
    const { uow, outboxStore } = createSqliteUnitOfWork(h.storage, clock);
    await uow.run(async (tx) => {
      await tx.outbox.append({ kind: "event", event: sampleEvent(1) });
      await tx.outbox.append({ kind: "event", event: sampleEvent(2) });
      return ok(undefined);
    });
    const [first] = unwrap(await outboxStore.pending(10));
    await outboxStore.markDelivered(first?.id ?? "");
    const never = new AbortController().signal;
    for (const k of ["done", "dead", "waiting"])
      await h.queue.enqueue(ws, { type: "t", payload: {}, idempotencyKey: k });
    const a = unwrap(await h.queue.claim(["t"], never));
    await h.queue.complete(a?.id ?? "", a?.lease);
    const b = unwrap(await h.queue.claim(["t"], never));
    await h.queue.fail(b?.id ?? "", "storage.failed", undefined, b?.lease);
    expect(unwrap(await pruneStorage(h.storage, clock, 60_000))).toEqual({
      outboxRows: 0,
      jobs: 0,
    });
    clock.advance(120_000);
    expect(unwrap(await pruneStorage(h.storage, clock, 60_000))).toEqual({
      outboxRows: 1,
      jobs: 2,
    });
    expect(unwrap(await outboxStore.pending(10)).length).toBe(1);
    expect(unwrap(await h.queue.claim(["t"], never))?.idempotencyKey).toBe("waiting");
  });
});

describe("job leases", () => {
  it("refuses a lease-less or wrong-lease ack (guards acknowledging a job another consumer holds)", async () => {
    const { queue } = queueHarness();
    const never = new AbortController().signal;
    await queue.enqueue(ws, { type: "t", payload: {}, idempotencyKey: "k" });
    const job = unwrap(await queue.claim(["t"], never));
    const id = job?.id ?? "";
    expect((await queue.complete(id)).ok).toBe(false);
    expect((await queue.complete(id, "wrong")).ok).toBe(false);
    expect((await queue.fail(id, "storage.failed")).ok).toBe(false);
    expect((await queue.fail(id, "storage.failed", undefined, "wrong")).ok).toBe(false);
    expect((await queue.complete(id, job?.lease)).ok).toBe(true);
  });
});

describe("migrator", () => {
  it("running migrations twice changes nothing (guards a re-run wiping or duplicating tables)", () => {
    const path = freshPath();
    const first = open(path);
    first.writer
      .prepare(
        "INSERT INTO digest_state (workspace_id, account_id, last_digest_at) VALUES ('w', 'a', '2026-01-01T00:00:00.000Z')",
      )
      .run();
    expect(unwrap(migrate(first.writer))).toEqual({ from: 2, to: 2 });
    first.close();
    const again = open(path);
    expect(again.writer.prepare("SELECT count(*) AS n FROM digest_state").get()).toEqual({ n: 1 });
  });

  it("refuses a database written by a newer build (guards downgrade corrupting a newer schema)", () => {
    const path = freshPath();
    const storage = open(path);
    storage.writer.pragma("user_version = 99");
    storage.close();
    const reopened = openStorage(path, key(1));
    expect(reopened.ok).toBe(false);
  });
});

describe("outbox crash safety", () => {
  it("delivers an event committed before a crash exactly once after reopening (guards events lost between write and relay)", async () => {
    const path = freshPath();
    const before = open(path);
    const { uow } = createSqliteUnitOfWork(before);
    await uow.run(async (tx) => {
      await tx.repositories.topics.save({
        schemaVersion: 1,
        id: "t-1" as never,
        workspaceId: ws,
        name: "Trips",
      });
      await tx.outbox.append({ kind: "event", event: sampleEvent(1) });
      return ok(undefined);
    });
    // "Kill": the process dies here, the connection is never closed, nothing was relayed.
    const after = open(path);
    const { outboxStore } = createSqliteUnitOfWork(after);
    const queue = createSqliteJobQueue(after, createFakeClock());
    const { bus, published } = recordingBus();
    const relay = createOutboxRelay({ store: outboxStore, bus, queue });
    expect(unwrap(await relay.drain()).delivered).toBe(1);
    expect(unwrap(await relay.drain()).delivered).toBe(0);
    expect(published).toEqual(["evt-1"]);
  });
});

describe("sync cursors", () => {
  it("keeps a committed cursor across a reopen but not one from a rolled-back batch (guards skipped or re-fetched mail after a restart)", async () => {
    const path = freshPath();
    const acc = "a-1" as never;
    const { uow } = createSqliteUnitOfWork(open(path));
    await uow.run(async (tx) =>
      tx.repositories.cursors.set(ws, acc, { scope: "sync", token: "5" }),
    );
    await uow.run(async (tx) => {
      await tx.repositories.cursors.set(ws, acc, { scope: "sync", token: "9" });
      return err(new StorageError("batch failed"));
    });
    opened.at(-1)?.close();
    const reopened = createSqliteUnitOfWork(open(path));
    expect(unwrap(await reopened.uow.reads.cursors.get(ws, acc, "sync"))).toEqual({
      scope: "sync",
      token: "5",
    });
  });
});

describe("a broken adapter fails the contract", () => {
  it("a unit of work that loses earlier writes on rollback fails the SQLite suite (guards a vacuous contract)", async () => {
    const failed = await failingChecks(unitOfWorkChecks, () => {
      let current = sqliteUnitOfWorkHarness();
      return {
        committedOutbox: () => current.committedOutbox(),
        uow: {
          get reads() {
            return current.uow.reads;
          },
          async run(work, signal) {
            const r = await current.uow.run(work, signal);
            if (!r.ok) current = sqliteUnitOfWorkHarness();
            return r;
          },
        },
      };
    });
    expect(failed).toContain(
      "keeps rows committed earlier when a later transaction rolls back (guards rollback wiping older data)",
    );
  });
});
