import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// M0-14 benchmark (ADR 0002): subscription events batched with ack-based backpressure over a real MessageChannel.
// The batcher lives in this file on purpose; the production layer is built in a later ticket from the ADR's findings.
// Timing assertions only run with POCHI_BENCH=1 (`POCHI_BENCH=1 pnpm vitest run src/shared/ipc/batching`); they are flaky on shared CI runners.
const eventSchema = z.object({ seq: z.number().int(), at: z.number() });
const batchSchema = z.object({ type: z.literal("batch"), events: z.array(eventSchema) });
const ackSchema = z.object({ type: z.literal("ack") });
type Event = z.infer<typeof eventSchema>;

const FLUSH_MS = 50;
const MAX_IN_FLIGHT = 2;

/** Buffers events and sends one message per flush; stops sending while too many batches are unacknowledged. */
const createBatcher = (port: MessagePort, onPost: () => void) => {
  let buffer: Event[] = [];
  let inFlight = 0;
  const flush = () => {
    if (buffer.length === 0 || inFlight >= MAX_IN_FLIGHT) return;
    inFlight++;
    onPost();
    port.postMessage({ type: "batch", events: buffer });
    buffer = [];
  };
  port.onmessage = (message) => {
    if (ackSchema.safeParse(message.data).success) {
      inFlight--;
      flush();
    }
  };
  const timer = setInterval(flush, FLUSH_MS);
  return {
    push: (event: Event) => void buffer.push(event),
    buffered: () => buffer.length,
    stop: () => clearInterval(timer),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (rate: number, seconds: number, consumerDelayMs: number) => {
  const { port1, port2 } = new MessageChannel();
  const received: Event[] = [];
  const latencies: number[] = [];
  let posts = 0;
  let maxBuffered = 0;
  port2.onmessage = async (message) => {
    const batch = batchSchema.parse(message.data);
    if (consumerDelayMs > 0) await sleep(consumerDelayMs); // slow renderer
    const now = performance.now();
    for (const event of batch.events) {
      received.push(event);
      latencies.push(now - event.at);
    }
    port2.postMessage({ type: "ack" });
  };
  const batcher = createBatcher(port1, () => void posts++);
  const total = rate * seconds;
  const start = performance.now();
  let seq = 0;
  while (seq < total) {
    const due = Math.min(total, Math.floor(((performance.now() - start) / 1000) * rate));
    while (seq < due) batcher.push({ seq: seq++, at: performance.now() });
    maxBuffered = Math.max(maxBuffered, batcher.buffered());
    await sleep(1);
  }
  while (received.length < total) await sleep(10);
  batcher.stop();
  port1.close();
  port2.close();
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN;
  const result = {
    rate,
    delivered: received.length,
    messages: posts,
    p95LatencyMs: Math.round(p95),
    maxBuffered,
    elapsedMs: Math.round(performance.now() - start),
  };
  console.info(`[M0-14] ${JSON.stringify(result)}`);
  return { received, result };
};

const bench = process.env["POCHI_BENCH"] === "1";

describe("batched event subscription over a MessagePort (M0-14 benchmark)", () => {
  // Guards: batching and backpressure must never lose or reorder events, even when the consumer is slower than the producer.
  it("delivers every event exactly once and in order, even with a slow consumer", async () => {
    const { received } = await run(1000, 1, 60);
    expect(received.map((event) => event.seq)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  }, 20_000);

  describe.skipIf(!bench)("timing (POCHI_BENCH=1)", () => {
    // Guards: 1k events/s must cost about 20-35 messages/s instead of 1000, with UI-fast latency.
    it("sends 1000 events/s in far fewer messages with low latency", async () => {
      const { result } = await run(1000, 3, 0);
      expect(result.messages).toBeLessThan(3000 / 10);
      expect(result.p95LatencyMs).toBeLessThan(200);
    }, 20_000);

    // Guards: a slow renderer must not flood the port; the producer sends fewer, larger batches.
    it("coalesces into larger batches when the consumer is slow", async () => {
      const { result } = await run(1000, 2, 120);
      expect(result.messages).toBeLessThan(2000 / 10);
    }, 20_000);
  });
});
