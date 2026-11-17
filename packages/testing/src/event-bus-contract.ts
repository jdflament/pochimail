import type { DomainEvent } from "@pochimail/core/events/catalog";
import { createLogger, type LogRecord } from "@pochimail/core/logger";
import type { EventBus } from "@pochimail/core/ports/event-bus";
import { describe, expect, it } from "vitest";
import { sampleClassified, sampleEvent } from "./event-samples.ts";
import { createFakeTimer, type FakeTimer } from "./fake-timer.ts";

export type EventBusDeps = {
  /** The bus must report handler failures only through this redacting logger. */
  logger: ReturnType<typeof createLogger>;
  timer: FakeTimer;
  handlerTimeoutMs: number;
};

const HANDLER_TIMEOUT_MS = 30_000;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Contract every EventBus implementation must satisfy. Exported so M2 adapters reuse it unchanged.
 * Test names state the bug each one prevents.
 */
export function eventBusContract(make: (deps: EventBusDeps) => EventBus<DomainEvent>): void {
  describe("EventBus contract", () => {
    const setup = () => {
      const records: LogRecord[] = [];
      const timer = createFakeTimer();
      const logger = createLogger({ sink: { write: (r) => records.push(r) } });
      const bus = make({ logger, timer, handlerTimeoutMs: HANDLER_TIMEOUT_MS });
      return { bus, records, timer };
    };

    it("a throwing subscriber does not stop other subscribers from receiving the event", async () => {
      const { bus, records } = setup();
      const received: string[] = [];
      bus.subscribe("ScanProgressed", () => {
        throw new Error("boom jane@example.com");
      });
      bus.subscribe("ScanProgressed", async () => {
        throw new Error("async boom");
      });
      bus.subscribe("ScanProgressed", (e) => {
        received.push(e.id);
      });
      const result = await bus.publish(sampleEvent(1));
      expect(result.ok).toBe(true);
      expect(received).toEqual(["evt-1"]);
      expect(records.filter((r) => r.level === "error")).toHaveLength(2);
      expect(JSON.stringify(records)).not.toMatch(/jane|example/);
    });

    it("a hung handler does not stall other subscribers, and publish resolves after the timeout", async () => {
      const { bus, timer, records } = setup();
      const received: number[] = [];
      bus.subscribe("ScanProgressed", () => new Promise<void>(() => {}));
      bus.subscribe("ScanProgressed", (e) => {
        received.push(e.payload.processed);
      });
      let settled = false;
      const publishing = bus.publish(sampleEvent(1)).then((r) => {
        settled = true;
        return r;
      });
      await tick();
      expect(received).toEqual([1]); // the healthy subscriber was not held up
      expect(settled).toBe(false); // publish waits for the hung one, but only up to the timeout
      timer.advance(HANDLER_TIMEOUT_MS);
      expect((await publishing).ok).toBe(true);
      expect(records.some((r) => r.fields.code === "event.handler_timeout")).toBe(true);
    });

    it("delivers events to each subscriber in publish order, even when a handler is slow", async () => {
      const { bus } = setup();
      const slow: number[] = [];
      const fast: number[] = [];
      bus.subscribe("ScanProgressed", async (e) => {
        if (e.payload.processed === 0) await tick();
        slow.push(e.payload.processed);
      });
      bus.subscribe("ScanProgressed", (e) => {
        fast.push(e.payload.processed);
      });
      await Promise.all([0, 1, 2, 3].map((n) => bus.publish(sampleEvent(n))));
      expect(slow).toEqual([0, 1, 2, 3]);
      expect(fast).toEqual([0, 1, 2, 3]);
    });

    it("an unsubscribed handler receives nothing, including events already queued; unsubscribe is idempotent", async () => {
      const { bus } = setup();
      const received: number[] = [];
      const off = bus.subscribe("ScanProgressed", async (e) => {
        received.push(e.payload.processed);
        await tick();
      });
      const first = bus.publish(sampleEvent(1));
      const queued = bus.publish(sampleEvent(2));
      await tick(); // handler 1 is running, event 2 is queued
      off();
      off();
      await Promise.all([first, queued]);
      await bus.publish(sampleEvent(3));
      expect(received).toEqual([1]);
    });

    it("rejects an event that fails its schema and delivers it to nobody", async () => {
      const { bus } = setup();
      const received: unknown[] = [];
      bus.subscribe("ScanProgressed", (e) => {
        received.push(e);
      });
      const bad = { ...sampleEvent(1), payload: { accountId: "a-1", processed: -5 } };
      const unknownType = { ...sampleEvent(1), type: "MailDeleted" };
      for (const event of [bad, unknownType, null, "x"]) {
        const result = await bus.publish(event as never); // untrusted input reaches the bus at runtime
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("event.invalid");
      }
      expect(received).toEqual([]);
    });

    it("strips subject/address keys from a payload before delivery (PII must not ride on events)", async () => {
      const { bus } = setup();
      const received: unknown[] = [];
      bus.subscribe("ScanProgressed", (e) => {
        received.push(e);
      });
      const event = sampleEvent(1);
      const dirty = {
        ...event,
        subject: "Your invoice",
        payload: { ...event.payload, subject: "Your invoice", from: "jane@example.com" },
      };
      expect((await bus.publish(dirty as never)).ok).toBe(true);
      expect(JSON.stringify(received)).not.toMatch(/invoice|jane|example\.com/);
      expect(received).toHaveLength(1);
    });

    it("only delivers the subscribed event type", async () => {
      const { bus } = setup();
      const received: string[] = [];
      bus.subscribe("MessageClassified", (e) => {
        received.push(e.type);
      });
      await bus.publish(sampleEvent(1));
      await bus.publish(sampleClassified(1));
      expect(received).toEqual(["MessageClassified"]);
    });
  });
}
