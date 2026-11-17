import { StorageError } from "@pochimail/core/errors";
import type { TopicId, WorkspaceId } from "@pochimail/core/ids";
import type { OutboxEntry, UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { err, ok } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";

export interface UnitOfWorkHarness {
  readonly uow: UnitOfWork;
  /** Everything committed to the outbox so far, in order. */
  committedOutbox(): Promise<readonly OutboxEntry[]>;
}

const ws = "w-1" as WorkspaceId;
const topic = { schemaVersion: 1 as const, id: "t-1" as TopicId, workspaceId: ws, name: "Trips" };
const entry: OutboxEntry = {
  kind: "job",
  workspaceId: ws,
  job: { type: "classify", payload: {}, idempotencyKey: "k-1" },
};

/**
 * Contract for any `UnitOfWork` (in-memory, SQLite). Exported so M2 adapters reuse it unchanged.
 * `make` must return a fresh, empty store for each test.
 */
export function unitOfWorkContract(
  make: () => UnitOfWorkHarness | Promise<UnitOfWorkHarness>,
): void {
  describe("UnitOfWork contract", () => {
    it("commits the row and its outbox entry together (guards events lost after a saved row)", async () => {
      const h = await make();
      const r = await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        await tx.outbox.append(entry);
        return ok("done");
      });
      expect(r).toEqual(ok("done"));
      expect((await h.uow.reads.topics.list(ws)).ok).toBe(true);
      expect(await h.uow.reads.topics.list(ws)).toEqual(ok([topic]));
      expect(await h.committedOutbox()).toEqual([entry]);
    });

    it("rolls back the row and the outbox entry when work returns an Err (guards a phantom event for a failed write)", async () => {
      const h = await make();
      const failure = new StorageError("boom");
      const r = await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        await tx.outbox.append(entry);
        return err(failure);
      });
      expect(r).toEqual(err(failure));
      expect(await h.uow.reads.topics.list(ws)).toEqual(ok([]));
      expect(await h.committedOutbox()).toEqual([]);
    });

    it("rolls back everything when work throws (guards a half-committed transaction after a bug)", async () => {
      const h = await make();
      await expect(
        h.uow.run(async (tx) => {
          await tx.repositories.topics.save(topic);
          await tx.outbox.append(entry);
          throw new Error("bug");
        }),
      ).rejects.toThrow("bug");
      expect(await h.uow.reads.topics.list(ws)).toEqual(ok([]));
      expect(await h.committedOutbox()).toEqual([]);
    });

    it("does not commit when the signal is already aborted (guards work continuing after cancel)", async () => {
      const h = await make();
      const controller = new AbortController();
      controller.abort();
      const r = await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        return ok(1);
      }, controller.signal);
      expect(r.ok).toBe(false);
      expect(await h.uow.reads.topics.list(ws)).toEqual(ok([]));
    });

    it("rolls back when the signal aborts mid-work (guards a cancelled scan leaving rows and events behind)", async () => {
      const h = await make();
      const controller = new AbortController();
      const r = await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        await tx.outbox.append(entry);
        controller.abort();
        return ok("finished anyway");
      }, controller.signal);
      expect(r.ok).toBe(false);
      expect(await h.uow.reads.topics.list(ws)).toEqual(ok([]));
      expect(await h.committedOutbox()).toEqual([]);
    });
  });
}
