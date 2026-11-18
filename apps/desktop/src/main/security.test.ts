import { EventEmitter } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FuseV1Options } from "@electron/fuses";
import type { WebContents } from "electron";
import { describe, expect, it } from "vitest";
import { buildCsp } from "../shared/csp.ts";
import { fuses } from "./fuses.ts";
import {
  allowedHosts,
  hardenWebContents,
  isAppUrl,
  isRequestAllowed,
  webPreferences,
} from "./security.ts";

const fakeWebContents = () => {
  const emitter = new EventEmitter();
  let openHandler: (() => { action: string }) | undefined;
  const contents = {
    setWindowOpenHandler: (handler: () => { action: "deny" }) => {
      openHandler = handler;
    },
    on: (event: string, listener: (e: { preventDefault: () => void }, url: string) => void) =>
      void emitter.on(event, listener),
  };
  const fire = (event: string, url = "") => {
    let prevented = false;
    emitter.emit(event, { preventDefault: () => (prevented = true) }, url);
    return prevented;
  };
  return { contents, fire, open: () => openHandler?.() };
};

// A platform-absolute path: pathToFileURL/pathname comparison must work on Windows too.
const rendererFile = resolve("/app/out/renderer/index.html");
const rendererUrl = pathToFileURL(rendererFile).href;
const isApp = (url: string) => isAppUrl(url, { rendererFile });

describe("window hardening", () => {
  // Guards: a page (or injected email content) opening a new window or leaving the app for an external site.
  it("denies window.open and blocks navigation or redirects to an external URL", () => {
    const { contents, fire, open } = fakeWebContents();
    hardenWebContents(contents as unknown as WebContents, isApp);
    expect(open()).toEqual({ action: "deny" });
    expect(fire("will-navigate", "https://evil.example/phish")).toBe(true);
    expect(fire("will-redirect", "https://evil.example/phish")).toBe(true);
    expect(fire("will-attach-webview", "https://evil.example")).toBe(true);
  });

  // Guards: over-blocking would break the app's own reloads.
  it("lets the app navigate within its own origin", () => {
    const { contents, fire } = fakeWebContents();
    hardenWebContents(contents as unknown as WebContents, isApp);
    expect(fire("will-navigate", rendererUrl)).toBe(false);
  });

  // Guards: file:// URLs that merely resemble the app page (other files, other dev origins) being treated as the app.
  it("recognises only the real app page", () => {
    const otherRenderer = pathToFileURL(resolve("/tmp/evil/renderer/index.html")).href;
    expect(isAppUrl(rendererUrl, { rendererFile })).toBe(true);
    expect(isAppUrl(`${rendererUrl}#/x?y=1`, { rendererFile })).toBe(true);
    expect(isAppUrl(pathToFileURL(resolve("/etc/passwd")).href, { rendererFile })).toBe(false);
    expect(isAppUrl(otherRenderer, { rendererFile })).toBe(false);
    expect(isAppUrl(rendererUrl)).toBe(false);
    expect(isAppUrl("https://evil.example/renderer/index.html", { rendererFile })).toBe(false);
    expect(isAppUrl("garbage", { rendererFile })).toBe(false);
    expect(isAppUrl("http://localhost:5173/x", { devServerOrigin: "http://localhost:5173" })).toBe(
      true,
    );
    expect(isAppUrl("http://localhost:6666/x", { devServerOrigin: "http://localhost:5173" })).toBe(
      false,
    );
  });
});

describe("session request filter", () => {
  // Guards: any outbound host that was never documented (brief §5.10 "No network except").
  it("blocks every remote host while the allowlist is empty", () => {
    expect(allowedHosts).toEqual([]);
    expect(isRequestAllowed("https://tracker.example/pixel.gif")).toBe(false);
    expect(isRequestAllowed("not a url")).toBe(false);
  });

  it("allows local content, the dev server, and explicitly allowlisted hosts", () => {
    expect(isRequestAllowed("file:///app/renderer/index.html")).toBe(true);
    expect(
      isRequestAllowed("http://localhost:5173/src/main.tsx", {
        devServerOrigin: "http://localhost:5173",
      }),
    ).toBe(true);
    expect(
      isRequestAllowed("http://localhost:9999/", { devServerOrigin: "http://localhost:5173" }),
    ).toBe(false);
    expect(isRequestAllowed("https://api.example/v1", { allowlist: ["api.example"] })).toBe(true);
  });
});

// Equivalent checklist for Electronegativity (last release 2023, predates this Electron major): the settings it flags as high.
describe("security baseline checklist", () => {
  it("keeps the renderer isolated", () => {
    expect(webPreferences).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it("ships a production CSP with no remote origin, inline script or network", () => {
    const csp = buildCsp({ dev: false });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*('unsafe-inline'|'unsafe-eval'|https?:|\*)/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp({ dev: true })).toContain("'unsafe-inline'"); // Vite HMR only
  });

  it("flips the fuses ADR 0002 requires", () => {
    expect(fuses).toMatchObject({
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });
});
