import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { createRpcClient } from "./client.ts";
import { serveRpc } from "./server.ts";
import { fromDomPort } from "./transport.ts";

// M0-14 latency guard (ADR 0002). Real timers over a real MessageChannel, so it only runs with POCHI_BENCH=1:
// `POCHI_BENCH=1 pnpm vitest run src/shared/ipc/rpc.bench`. Flaky on shared CI runners by nature.
describe.skipIf(process.env.POCHI_BENCH !== "1")("latency (POCHI_BENCH=1)", () => {
  // Guards: batching adding visible lag; p95 emit-to-render must stay under 200 ms at 1000 events/s.
  it("keeps p95 latency under 200 ms at 1000 events/s", async () => {
    const { port1, port2 } = new MessageChannel();
    port1.start();
    port2.start();
    let emit: (event: { type: "ActionApplied"; actionId: string }) => void = () => {};
    serveRpc(fromDomPort(port2), {
      procedures: {},
      subscriptions: {
        "app.events": (_input, push) => {
          emit = push;
          return undefined;
        },
      },
    });
    const latencies: number[] = [];
    createRpcClient(fromDomPort(port1)).subscribe("app.events", undefined, (event) => {
      if (event.type === "ActionApplied")
        latencies.push(performance.now() - Number(event.actionId));
    });
    await vi.waitFor(() => expect(emit).not.toBe(undefined));
    const total = 2000;
    const start = performance.now();
    let sent = 0;
    while (sent < total) {
      const due = Math.min(total, Math.floor(performance.now() - start));
      while (sent < due) {
        emit({ type: "ActionApplied", actionId: String(performance.now()) });
        sent++;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    await vi.waitFor(() => expect(latencies).toHaveLength(total), { timeout: 10_000 });
    const sorted = [...latencies].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN).toBeLessThan(200);
    port1.close();
    port2.close();
  }, 20_000);
});
