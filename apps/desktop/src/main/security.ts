import { pathToFileURL } from "node:url";
import { egressPolicy, matchesAllowlistEntry } from "@pochimail/net/egress/allowlist";
import type { WebContents, WebPreferences } from "electron";

/**
 * Default of the low-level helper: deny everything until a caller supplies a policy. Main passes
 * `sessionEgress`, so the session filter and the worker's HTTP client share one set of rules.
 */
export const allowedHosts: readonly string[] = [];

/**
 * Main's view of the shared egress policy: the static H1–H5 hosts.
 */
export const sessionEgress = egressPolicy.create();

export const webPreferences = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  experimentalFeatures: false,
} as const satisfies WebPreferences;

const localSchemes = new Set(["file:", "devtools:", "data:", "blob:"]);

/** Session request filter decision: local schemes and the dev server pass, every other host must be on the allowlist. */
export const isRequestAllowed = (
  rawUrl: string,
  options: { devServerOrigin?: string | undefined; allowlist?: readonly string[] } = {},
): boolean => {
  const allowlist = options.allowlist ?? allowedHosts;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (localSchemes.has(url.protocol)) return true;
  if (options.devServerOrigin !== undefined && url.origin === options.devServerOrigin) return true;
  if (
    options.devServerOrigin !== undefined &&
    url.protocol === "ws:" &&
    url.host === new URL(options.devServerOrigin).host
  )
    return true;
  // Exact host (and recorded port) only: no wildcard or suffix match, same as the worker client.
  // Remote plaintext HTTP is never allowed (threat model N2); the dev server passed above.
  if (url.protocol === "http:") return false;
  return allowlist.some((entry) => matchesAllowlistEntry(entry, url));
};

/** Blocks window.open, webviews and any navigation away from the app's own origin. */
export const hardenWebContents = (
  contents: WebContents,
  appOrigin: (url: string) => boolean,
): void => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockExternal = (event: { preventDefault: () => void }, url: string) => {
    if (!appOrigin(url)) event.preventDefault();
  };
  contents.on("will-navigate", blockExternal);
  contents.on("will-redirect", blockExternal);
  contents.on("will-attach-webview", (event) => event.preventDefault());
};

/**
 * True only for the app's own page: the dev server origin (dev builds only, the caller passes none when packaged) or
 * exactly the packaged renderer file. Any other `file:` path is refused.
 */
export const isAppUrl = (
  rawUrl: string,
  options: { devServerOrigin?: string | undefined; rendererFile?: string | undefined } = {},
): boolean => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (options.devServerOrigin !== undefined) return url.origin === options.devServerOrigin;
  if (options.rendererFile === undefined || url.protocol !== "file:") return false;
  return url.pathname === pathToFileURL(options.rendererFile).pathname;
};
