import { describe, expect, it, vi } from "vitest";
import { osChannels } from "../shared/os-calls.ts";
import { type OsCallDeps, registerOsCalls } from "./os-calls.ts";

const setup = () => {
  const handlers = new Map<string, (event: never, ...args: unknown[]) => unknown>();
  const deps = {
    ipc: { handle: (channel, listener) => void handlers.set(channel, listener as never) },
    openExternal: vi.fn(async () => {}),
    showItemInFolder: vi.fn(),
    chooseFolder: vi.fn(async () => "/Users/me/Exports"),
    isAppUrl: (url: string) => url.startsWith("file:///app/"),
    appDataDirs: () => ["/Users/me/Library/Application Support/Pochimail"],
  } satisfies OsCallDeps;
  registerOsCalls(deps);
  const app = { senderFrame: { url: "file:///app/index.html" } } as never;
  return { handlers, deps, app };
};

describe("main-process OS calls", () => {
  // Guards: main must stay a thin OS shim. Any extra ipcMain channel is a path for mail data or a wider attack surface.
  it("registers exactly the three OS channels and nothing mail related", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual(Object.values(osChannels).sort());
  });

  // Guards: a compromised renderer must not turn "open mail app" into "open any URL or run a local file".
  it("opens mail-app links only, never web or file URLs", async () => {
    const { handlers, deps, app } = setup();
    const open = handlers.get(osChannels.openMailAppLink);
    await open?.(app, "mailto:someone@example.com");
    expect(deps.openExternal).toHaveBeenCalledWith("mailto:someone@example.com");
    for (const bad of [
      "https://evil.example/x",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "nope",
      42,
    ])
      expect(() => open?.(app, bad)).toThrow();
    expect(deps.openExternal).toHaveBeenCalledTimes(1);
  });

  // Guards: a frame that is not our page (an injected iframe, a navigated window) must not reach the OS.
  it("refuses calls from a sender that is not the app page", () => {
    const { handlers, deps } = setup();
    const stranger = { senderFrame: { url: "https://evil.example/" } } as never;
    expect(() => handlers.get(osChannels.showInFinder)?.(stranger, "/tmp")).toThrow(
      "unknown sender",
    );
    expect(deps.showItemInFolder).not.toHaveBeenCalled();
  });

  it("returns the chosen folder or null when the dialog is cancelled", async () => {
    const { handlers, deps, app } = setup();
    await expect(handlers.get(osChannels.chooseFolder)?.(app)).resolves.toBe("/Users/me/Exports");
    deps.chooseFolder.mockResolvedValueOnce(null as never);
    await expect(handlers.get(osChannels.chooseFolder)?.(app)).resolves.toBeNull();
  });

  // Guards: "show in Finder" turning into a way to probe or reveal arbitrary files (~/.ssh, other users' folders).
  it("reveals only folders the user picked or the app's own data folder", async () => {
    const { handlers, deps, app } = setup();
    const reveal = handlers.get(osChannels.showInFinder);
    expect(() => reveal?.(app, "/Users/me/.ssh")).toThrow("not chosen");
    expect(() => reveal?.(app, "/Users/me/Exports")).toThrow("not chosen"); // not picked yet
    await handlers.get(osChannels.chooseFolder)?.(app);
    reveal?.(app, "/Users/me/Exports");
    reveal?.(app, "/Users/me/Exports/2026/report.csv");
    reveal?.(app, "/Users/me/Library/Application Support/Pochimail/logs");
    expect(() => reveal?.(app, "/Users/me/Exports/../.ssh")).toThrow("not chosen");
    expect(() => reveal?.(app, "/Users/me/Exports-evil")).toThrow("not chosen");
    expect(deps.showItemInFolder).toHaveBeenCalledTimes(3);
  });
});
