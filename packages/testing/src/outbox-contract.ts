import { StorageError } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import type { TopicId, WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import type { EventBus } from "@pochimail/pipeline/event-bus";
import type { JobQueue } from "@pochimail/pipeline/job-queue";
import type { OutboxEntry, OutboxStore } from "@pochimail/pipeline/outbox";
import { createOutboxRelay } from "@pochimail/pipeline/outbox-relay";
import { describe, expect, it } from "vitest";
import { sampleEvent } from "./event-samples.ts";
import type { UnitOfWork } from "./uow-types.ts";

export interface OutboxContractHarness {
  /** Transactions whose outbox appends land in `store` on commit. */
  readonly uow: UnitOfWork;
  readonly store: OutboxStore;
  /** Where the relay hands job entries. */
  readonly queue: JobQueue;
}

const ws = "w-1" as WorkspaceId;
const topic = { schemaVersion: 1 as const, id: "t-1" as TopicId, workspaceId: ws, name: "Trips" };
const event = (n: number): OutboxEntry => ({ kind: "event", event: sampleEvent(n) });
const jobRequest = { type: "classify", payload: {}, idempotencyKey: "classify-1" };
const job: OutboxEntry = { kind: "job", workspaceId: ws, job: jobRequest };
const never = new AbortController().signal;

/** A bus that records what it was asked to publish and can be told to "crash" on one event. */
function recordingBus(crashOn?: string) {
  const published: string[] = [];
  const bus: EventBus<EventEnvelope> = {
    async publish(e) {
      if (e.id === crashOn) throw new Error("process died");
      published.push(e.id);
      return ok(undefined);
    },
    subscribe: () => () => {},
  };
  return { bus, published };
}

/**
 * Contract for any transactional outbox + relay (in-memory, SQLite). Exported so M2 adapters
 * reuse it unchanged. `make` returns a fresh, empty store.
 */
export function runOutboxContract(
  make: () => OutboxContractHarness | Promise<OutboxContractHarness>,
): void {
  describe("Outbox contract", () => {
    it("publishes committed events after commit, in order, and marks them delivered (guards lost or reordered events)", async () => {
      const h = await make();
      await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        await tx.outbox.append(event(1));
        await tx.outbox.append(event(2));
        return ok(undefined);
      });
      const { bus, published } = recordingBus();
      const relay = createOutboxRelay({ store: h.store, bus, queue: h.queue });
      expect(unwrap(await relay.drain())).toEqual({ delivered: 2, rejected: 0 });
      expect(published).toEqual(["evt-1", "evt-2"]);
      expect(unwrap(await h.store.pending(10))).toEqual([]);
    });

    it("rolls back the state change and the outbox append together when the transaction fails (guards a phantom event for a failed write)", async () => {
      const h = await make();
      const failed = await h.uow.run(async (tx) => {
        await tx.repositories.topics.save(topic);
        await tx.outbox.append(event(1));
        return err(new StorageError("boom"));
      });
      expect(failed.ok).toBe(false);
      await expect(
        h.uow.run(async (tx) => {
          await tx.repositories.topics.save(topic);
          await tx.outbox.append(event(2));
          throw new Error("bug");
        }),
      ).rejects.toThrow("bug");
      expect(unwrap(await h.uow.reads.topics.list(ws))).toEqual([]);
      const { bus, published } = recordingBus();
      await createOutboxRelay({ store: h.store, bus, queue: h.queue }).drain();
      expect(published).toEqual([]);
    });

    it("re-publishes only undelivered events after a relay crash (guards both lost and duplicated events)", async () => {
      const h = await make();
      await h.uow.run(async (tx) => {
        for (const n of [1, 2, 3]) await tx.outbox.append(event(n));
        return ok(undefined);
      });
      const crashing = recordingBus("evt-2");
      const first = createOutboxRelay({ store: h.store, bus: crashing.bus, queue: h.queue });
      await expect(first.drain()).rejects.toThrow("process died");
      expect(crashing.published).toEqual(["evt-1"]);

      const restarted = recordingBus();
      const second = createOutboxRelay({ store: h.store, bus: restarted.bus, queue: h.queue });
      expect(unwrap(await second.drain()).delivered).toBe(2);
      expect(restarted.published).toEqual(["evt-2", "evt-3"]);
    });

    it("hands job entries to the queue once even when the relay re-runs them (guards duplicate jobs after a crash)", async () => {
      const h = await make();
      await h.uow.run(async (tx) => {
        await tx.outbox.append(job);
        return ok(undefined);
      });
      const { bus } = recordingBus();
      await createOutboxRelay({ store: h.store, bus, queue: h.queue }).drain();
      // A crash before markDelivered replays the row: simulate it by enqueuing the key again.
      await h.queue.enqueue(ws, jobRequest);
      expect(unwrap(await h.queue.claim(["classify"], never))?.type).toBe("classify");
      expect(unwrap(await h.queue.claim(["classify"], never))).toBeNull();
    });

    it("keeps delivering after the bus rejects an invalid event (guards one poison row blocking the outbox forever)", async () => {
      const h = await make();
      await h.uow.run(async (tx) => {
        await tx.outbox.append(event(1));
        await tx.outbox.append(event(2));
        return ok(undefined);
      });
      const published: string[] = [];
      const bus: EventBus<EventEnvelope> = {
        async publish(e) {
          if (e.id === "evt-1") return err({ code: "event.invalid" } as never);
          published.push(e.id);
          return ok(undefined);
        },
        subscribe: () => () => {},
      };
      const report = unwrap(
        await createOutboxRelay({ store: h.store, bus, queue: h.queue }).drain(),
      );
      expect(report).toEqual({ delivered: 2, rejected: 1 });
      expect(published).toEqual(["evt-2"]);
    });
  });
}
