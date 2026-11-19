import { unwrap } from "@pochimail/kernel/result";
import { failingChecks } from "@pochimail/kernel/testing/contract";
import { unitOfWorkChecks } from "@pochimail/testing/unit-of-work-contract";
import { describe, expect, it } from "vitest";
import { queueHarness, sqliteUnitOfWorkHarness, ws } from "./test-support/storage.ts";

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
