import { describe, expect, it } from "vitest";
import { deviceNameContract } from "../../test-support/device-name-contract.ts";
import { createPlatformAdapter } from "../platform.ts";
import { createRpcClient } from "./client.ts";
import { serveRpc } from "./server.ts";
import { fromDomPort, type Transport } from "./transport.ts";

// The exported suite is the same one M2 adapters will run: no desktop-specific test helpers.
deviceNameContract(() => (os) => createPlatformAdapter(os, "/fake/pochimail-data").deviceName());

/** A real two-ended port pair: a server's reply must never be fed back into itself. */
const loopback = () => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  return {
    client: fromDomPort(port1),
    server: fromDomPort(port2),
    close: () => {
      port1.close();
      port2.close();
    },
  };
};

const serveDeviceName = (transport: Transport, os: unknown): void => {
  const platform = createPlatformAdapter(os, "/fake/pochimail-data");
  serveRpc(transport, {
    procedures: { "device.name": () => platform.deviceName() },
    subscriptions: {},
  });
};

describe("device-name RPC contract (M4-07)", () => {
  // Guards: the Platform device name must reach the renderer through the typed RPC, not a side channel.
  it("delivers the Platform device name to the renderer over the worker port", async () => {
    const { client, server, close } = loopback();
    serveDeviceName(server, "win32");
    const rpc = createRpcClient(client);
    expect(await rpc.call("device.name")).toBe("PC");
    expect(await rpc.call("device.name")).toBe("PC");
    close();
  });

  // Guards: 'this undefined' in copy when the worker's OS is unknown.
  it("uses the neutral name when the worker's OS is empty", async () => {
    const { client, server, close } = loopback();
    serveDeviceName(server, undefined);
    expect(await createRpcClient(client).call("device.name")).toBe("device");
    close();
  });

  // Guards: a promise that never settles when the worker stays silent.
  it("rejects when the worker stays silent", async () => {
    const transport: Transport = {
      post: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      close: () => undefined,
    };
    await expect(createRpcClient(transport, { timeoutMs: 5 }).call("device.name")).rejects.toThrow(
      "worker did not answer",
    );
  });
});
