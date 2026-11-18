import { beforeEach, describe, expect, it, vi } from "vitest";

const exposed: Record<string, Record<string, unknown>> = {};
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: Record<string, unknown>) => {
      exposed[name] = api;
    },
  },
  ipcRenderer: { once: vi.fn(), on: vi.fn(), invoke: vi.fn(), send: vi.fn() },
}));

describe("preload bridge", () => {
  beforeEach(() => vi.resetModules());

  // Guards: a secret/keychain API (or a raw ipcRenderer) being exposed to the page through the preload.
  it("exposes only requestWorkerPort: no secret API, no ipcRenderer", async () => {
    await import("./preload.ts");
    expect(Object.keys(exposed)).toEqual(["pochimail"]);
    expect(Object.keys(exposed.pochimail ?? {})).toEqual(["requestWorkerPort"]);
  });
});
