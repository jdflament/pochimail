import { StorageError } from "@pochimail/kernel/errors";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import { createOutboxRelay } from "@pochimail/pipeline/outbox-relay";
import { sampleEvent } from "@pochimail/testing/event-samples";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { describe, expect, it } from "vitest";
import { createSqliteJobQueue } from "./sqlite-job-queue.ts";
import { createSqliteUnitOfWork } from "./sqlite-unit-of-work.ts";
import { freshPath, open, opened, queueHarness, recordingBus, ws } from "./test-support/storage.ts";

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
