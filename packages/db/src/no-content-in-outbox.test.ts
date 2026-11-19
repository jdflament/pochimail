import { ok, unwrap } from "@pochimail/kernel/result";
import { sampleEvent } from "@pochimail/testing/event-samples";
import { describe, expect, it } from "vitest";
import { pruneStorage } from "./prune.ts";
import { createSqliteUnitOfWork } from "./sqlite-unit-of-work.ts";
import { queueHarness, ws } from "./test-support/storage.ts";

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
