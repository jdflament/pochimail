import { parseDomainEvent } from "@pochimail/core/events/catalog";
import { createLogger } from "@pochimail/logger/logger";
import { createEventBatcher } from "@pochimail/pipeline/event-batching";
import { createInMemoryEventBus } from "@pochimail/pipeline/in-memory-event-bus";
import { describe, expect, it } from "vitest";
import { eventBusContract } from "./event-bus-contract.ts";
import { sampleEvent } from "./event-samples.ts";
import { createFakeTimer } from "./fake-timer.ts";

eventBusContract(({ logger, timer, handlerTimeoutMs }) =>
  createInMemoryEventBus({ parse: parseDomainEvent, logger, timer, handlerTimeoutMs }),
);

describe("event batcher", () => {
  const make = () => {
    const timer = createFakeTimer();
    type Progress = { fetched: number; count?: number };
    const out: Progress[] = [];
    const batcher = createEventBatcher<Progress>({
      windowMs: 100,
      timer,
      coalesce: (events) => ({ fetched: events.at(-1)?.fetched ?? 0, count: events.length }),
      emit: (e) => out.push(e),
    });
    return { timer, out, batcher };
  };

  it("emits one coalesced event per window for 1,000 rapid events (UI flooded by progress)", () => {
    const { timer, out, batcher } = make();
    for (let i = 1; i <= 1000; i++) batcher.add({ fetched: i });
    expect(out).toEqual([]);
    timer.advance(100);
    expect(out).toEqual([{ fetched: 1000, count: 1000 }]);
    timer.advance(500);
    expect(out).toHaveLength(1);
  });

  it("opens a fresh window after emitting, and flush emits early without a duplicate", () => {
    const { timer, out, batcher } = make();
    batcher.add({ fetched: 1 });
    batcher.flush();
    timer.advance(100);
    expect(out).toEqual([{ fetched: 1, count: 1 }]);
    batcher.add({ fetched: 2 });
    timer.advance(100);
    expect(out).toHaveLength(2);
  });
});

describe("sample events", () => {
  it("stay valid against the catalog (samples must not drift from the schema)", async () => {
    const bus = createInMemoryEventBus({
      parse: parseDomainEvent,
      logger: createLogger({ sink: { write: () => {} } }),
      timer: createFakeTimer(),
    });
    expect((await bus.publish(sampleEvent(1))).ok).toBe(true);
  });
});
