import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRpcClient } from "../shared/ipc/client.ts";
import { serveRpc } from "../shared/ipc/server.ts";
import { fromDomPort } from "../shared/ipc/transport.ts";
import { acceptPorts } from "./ports.ts";

const live = new Set<unknown>();
beforeEach(() => {
  live.clear();
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(((
    ...args: Parameters<typeof setInterval>
  ) => {
    const handle = realSet(...args);
    live.add(handle);
    return handle;
  }) as typeof setInterval);
  vi.spyOn(globalThis, "clearInterval").mockImplementation(((handle: never) => {
    live.delete(handle);
    realClear(handle);
  }) as typeof clearInterval);
});
afterEach(() => void vi.restoreAllMocks());

describe("worker port switching", () => {
  // Guards: after a renderer reload the old connection's timers and handlers living on (closing a port runs no teardown).
  it("disposes the previous server, its subscriptions and its timer when a new port arrives", async () => {
    const parent = new EventEmitter();
    const stop = vi.fn();
    const channels: MessageChannel[] = [];
    acceptPorts(parent as never, (port: MessagePort) => {
      port.start();
      return serveRpc(fromDomPort(port), {
        procedures: {},
        subscriptions: {
          "app.events": (_input, emit) => {
            emit({ type: "ActionApplied", actionId: "a" });
            return stop;
          },
        },
      });
    });
    const connect = () => {
      const channel = new MessageChannel();
      channels.push(channel);
      channel.port1.start();
      parent.emit("message", { data: { type: "port" }, ports: [channel.port2] });
      return channel;
    };

    const first = connect();
    createRpcClient(fromDomPort(first.port1)).subscribe("app.events", undefined, () => {});
    await vi.waitFor(() => expect(live.size).toBe(1));

    connect(); // the reload
    expect(stop).toHaveBeenCalledTimes(1);
    expect(live.size).toBe(0);
    for (const channel of channels) {
      channel.port1.close();
      channel.port2.close();
    }
  });
});
