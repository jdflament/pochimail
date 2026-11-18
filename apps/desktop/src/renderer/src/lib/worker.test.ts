import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("connectWorker", () => {
  // Guards: StrictMode/remount calling twice, which hung the second call (port handed over once) or put two clients on one port.
  it("returns the same client for every call and asks for the port once", async () => {
    const win = new EventTarget() as EventTarget & { pochimail: unknown };
    const { port1, port2 } = new MessageChannel();
    const requestWorkerPort = vi.fn(() => {
      queueMicrotask(() =>
        win.dispatchEvent(
          Object.assign(new Event("message"), {
            source: win,
            data: "pochimail:worker-port",
            ports: [port1],
          }),
        ),
      );
    });
    win.pochimail = { requestWorkerPort };
    vi.stubGlobal("window", win);
    const { connectWorker } = await import("./worker.ts");
    const [a, b] = await Promise.all([connectWorker(), connectWorker()]);
    expect(a).toBe(b);
    expect(await connectWorker()).toBe(a);
    expect(requestWorkerPort).toHaveBeenCalledTimes(1);
    port1.close();
    port2.close();
  });
});
