import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventBatcher } from "./batcher.ts";

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

/** Pushes `rate` events/s for `seconds` and acks each batch after `consumerMs`; returns batch sizes and event order. */
const simulate = (rate: number, seconds: number, consumerMs: number) => {
  const sizes: number[] = [];
  const seen: number[] = [];
  let batcher: ReturnType<typeof createEventBatcher<number>> | undefined;
  batcher = createEventBatcher<number>((events) => {
    sizes.push(events.length);
    for (const event of events) seen.push(event.data);
    setTimeout(() => batcher?.ack(), consumerMs);
  });
  const total = rate * seconds;
  const perMs = rate / 1000;
  for (let ms = 0; ms < seconds * 1000; ms++) {
    for (let i = 0; i < perMs; i++) batcher.push(0, seen.length + 0, undefined);
    vi.advanceTimersByTime(1);
  }
  vi.advanceTimersByTime(5000);
  batcher.stop();
  return { sizes, seen, total };
};

describe("event batcher", () => {
  // Guards: M0-14 efficiency, 1000 events/s must cost about 20-60 messages/s, not one message per event.
  it("sends 3000 events in under 300 messages", () => {
    const { sizes } = simulate(1000, 3, 0);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(3000);
    expect(sizes.length).toBeLessThan(300);
  });

  // Guards: a slow renderer being flooded; the worker must send fewer, larger batches instead.
  it("sends larger batches to a slow consumer than to a fast one", () => {
    const fast = simulate(1000, 2, 0);
    const slow = simulate(1000, 2, 120);
    expect(slow.sizes.length).toBeLessThan(fast.sizes.length);
    expect(Math.max(...slow.sizes)).toBeGreaterThan(Math.max(...fast.sizes));
    expect(slow.sizes.reduce((a, b) => a + b, 0)).toBe(2000);
  });

  // Guards: unbounded batch size, and the in-flight window of 2 being exceeded without acks.
  it("never posts more than 2 unacknowledged batches or more than 500 events per batch", () => {
    const sizes: number[] = [];
    const batcher = createEventBatcher<number>((events) => void sizes.push(events.length));
    for (let i = 0; i < 2000; i++) batcher.push(0, i);
    vi.advanceTimersByTime(1000);
    expect(sizes).toEqual([500, 500]); // window full, 1000 still buffered
    batcher.ack();
    expect(sizes).toEqual([500, 500, 500]);
    batcher.ack();
    batcher.ack();
    batcher.ack();
    expect(sizes).toEqual([500, 500, 500, 500]);
    batcher.stop();
  });

  // Guards: a renderer that never acks growing the worker's memory without limit.
  it("refuses events past the buffer cap", () => {
    const batcher = createEventBatcher<number>(() => {}, { maxBuffered: 100, maxBatch: 10 });
    let accepted = 0;
    for (let i = 0; i < 300; i++) if (batcher.push(0, i)) accepted++;
    expect(accepted).toBeLessThan(300);
    expect(batcher.push(0, 1)).toBe(false);
    batcher.stop();
  });

  // Guards: an idle or stopped connection keeping a 50 ms timer alive forever (worker CPU wakeups, leaked port).
  it("holds no timer while idle or after stop", () => {
    const batcher = createEventBatcher<number>(() => {});
    expect(vi.getTimerCount()).toBe(0);
    batcher.push(0, 1);
    expect(vi.getTimerCount()).toBe(1);
    batcher.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
