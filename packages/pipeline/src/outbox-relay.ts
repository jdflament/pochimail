import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import { err, ok } from "@pochimail/kernel/result";
import type { EventBus } from "./event-bus.ts";
import type { JobQueue } from "./job-queue.ts";
import type { OutboxStore } from "./outbox.ts";

export interface OutboxRelayDeps {
  readonly store: OutboxStore;
  readonly bus: EventBus<EventEnvelope>;
  readonly queue: JobQueue;
  /** Rows read per round trip. Default 100. */
  readonly batchSize?: number;
}

export interface DrainReport {
  /** Rows published or enqueued and marked delivered, including `rejected`. */
  readonly delivered: number;
  /** Events the bus refused as invalid: marked delivered so one poison row cannot block the rest. */
  readonly rejected: number;
}

export interface OutboxRelay {
  /**
   * Delivers every committed, undelivered row in append order, then marks each delivered
   * AFTER the bus (or queue) accepted it. A crash between the two re-delivers that one row on
   * the next `drain`: at-least-once, so handlers dedupe on `event.id` and job enqueue is
   * idempotent by key. Stops at the first storage error, leaving the rest for the next drain.
   */
  drain(signal?: CancelSignal): AsyncResult<DrainReport, StorageError>;
}

export function createOutboxRelay(deps: OutboxRelayDeps): OutboxRelay {
  const batchSize = deps.batchSize ?? 100;
  return {
    async drain(signal) {
      let delivered = 0;
      let rejected = 0;
      while (!signal?.aborted) {
        const page = await deps.store.pending(batchSize);
        if (!page.ok) return err(page.error);
        if (page.value.length === 0) break;
        for (const record of page.value) {
          if (signal?.aborted) return ok({ delivered, rejected });
          const { entry } = record;
          if (entry.kind === "event") {
            const published = await deps.bus.publish(entry.event);
            if (!published.ok) rejected += 1;
          } else {
            const queued = await deps.queue.enqueue(entry.workspaceId, entry.job);
            if (!queued.ok) return err(queued.error);
          }
          const marked = await deps.store.markDelivered(record.id);
          if (!marked.ok) return err(marked.error);
          delivered += 1;
        }
      }
      return ok({ delivered, rejected });
    },
  };
}
