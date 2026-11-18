import { deviceNameContract } from "@pochimail/testing/device-name-contract";
import { describe, expect, it } from "vitest";
import { createPlatformAdapter } from "../platform.ts";
import { createDeviceNameClient, serveDeviceName, type Transport } from "./device-name.ts";

// The exported suite is the same one M2 adapters will run: no desktop-specific test helpers.
deviceNameContract(() => (os) => createPlatformAdapter(os, "/fake/pochimail-data").deviceName());

/** One MessagePort loopback: both sides subscribe to the same broadcast transport. */
const loopback = (): Transport => {
  const handlers: Array<(data: unknown) => void> = [];
  return {
    post: (message) => {
      for (const handler of [...handlers]) handler(message);
    },
    onMessage: (handler) => {
      handlers.push(handler);
    },
  };
};

describe("device-name IPC contract (M4-07)", () => {
  it("delivers the Platform device name to the renderer over the worker port", async () => {
    const transport = loopback();
    serveDeviceName(transport, createPlatformAdapter("win32", "/fake/pochimail-data"));
    const client = createDeviceNameClient(transport);
    expect(await client.deviceName()).toBe("PC");
    expect(await client.deviceName()).toBe("PC");
  });

  it("uses the neutral name when the worker's OS is empty (guards 'this undefined' in copy)", async () => {
    const transport = loopback();
    serveDeviceName(transport, createPlatformAdapter(undefined, "/fake/pochimail-data"));
    expect(await createDeviceNameClient(transport).deviceName()).toBe("computer");
  });

  it("rejects when the worker stays silent (guards a promise that never settles)", async () => {
    const transport: Transport = { post: () => undefined, onMessage: () => undefined };
    await expect(createDeviceNameClient(transport, 5).deviceName()).rejects.toThrow(
      "worker did not answer",
    );
  });
});
