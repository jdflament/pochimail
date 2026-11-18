import { beforeEach, describe, expect, it, vi } from "vitest";

const exposed: [string, Record<string, unknown>][] = [];
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: Record<string, unknown>) => void exposed.push([key, api]),
  },
  ipcRenderer: { once: vi.fn(), invoke: vi.fn(async () => null) },
}));

beforeEach(() => {
  exposed.length = 0;
  vi.resetModules();
});

describe("preload surface", () => {
  // Guards: the page must only ever see these four methods; any new key (or a leaked ipcRenderer/Node) widens the attack surface.
  it("exposes one object with exactly the allowed methods and nothing else", async () => {
    await import("./preload.ts");
    expect(exposed).toHaveLength(1);
    const [key, api] = exposed[0] ?? ["", {}];
    expect(key).toBe("pochimail");
    expect(Object.keys(api).sort()).toEqual([
      "chooseFolder",
      "openMailAppLink",
      "requestWorkerPort",
      "showInFinder",
    ]);
    for (const value of Object.values(api)) expect(typeof value).toBe("function");
    for (const leaked of ["ipcRenderer", "require", "process", "electron", "send", "invoke", "on"])
      expect(api).not.toHaveProperty(leaked);
  });

  // Guards: the keychain-backed store stays in main/worker; no secret API reaches the page (M2-04).
  it("never exposes a secret or keychain procedure", async () => {
    await import("./preload.ts");
    const api = exposed[0]?.[1] ?? {};
    for (const name of [
      "getSecret",
      "setSecret",
      "removeSecret",
      "protection",
      "secretStore",
      "serveSecrets",
    ])
      expect(api).not.toHaveProperty(name);
  });

  // Guards: a hostile page must not get a bad link as far as main; the preload rejects it first.
  it("validates arguments before calling main", async () => {
    await import("./preload.ts");
    const api = exposed[0]?.[1] as { openMailAppLink: (link: string) => Promise<void> };
    expect(() => api.openMailAppLink("https://evil.example")).toThrow();
  });

  // Guards: an empty or NUL-laced path, or a non-string folder reply, reaching the page or main unchecked.
  it("validates showInFinder arguments and the chooseFolder reply", async () => {
    const { ipcRenderer } = await import("electron");
    await import("./preload.ts");
    const api = exposed[0]?.[1] as {
      showInFinder: (path: string) => Promise<void>;
      chooseFolder: () => Promise<string | null>;
    };
    expect(() => api.showInFinder("")).toThrow();
    expect(() => api.showInFinder("a\0b")).toThrow();
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce(42);
    await expect(api.chooseFolder()).rejects.toThrow();
    vi.mocked(ipcRenderer.invoke).mockResolvedValueOnce("/Users/me/Exports");
    await expect(api.chooseFolder()).resolves.toBe("/Users/me/Exports");
  });
});
