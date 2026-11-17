import type { WebContents, WebPreferences } from "electron";

/** Hosts the app may reach. Empty on purpose: every outbound host is added with an ADR note (brief §5.10, docs/security/network.md). */
export const allowedHosts: readonly string[] = [];

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
export const isRequestAllowed = (rawUrl: string, options: { devServerOrigin?: string | undefined; allowlist?: readonly string[] } = {}): boolean => {
  const allowlist = options.allowlist ?? allowedHosts;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (localSchemes.has(url.protocol)) return true;
  if (options.devServerOrigin !== undefined && url.origin === options.devServerOrigin) return true;
  if (options.devServerOrigin !== undefined && url.protocol === "ws:" && url.host === new URL(options.devServerOrigin).host) return true;
  return allowlist.includes(url.hostname);
};

/** Blocks window.open, webviews and any navigation away from the app's own origin. */
export const hardenWebContents = (contents: WebContents, appOrigin: (url: string) => boolean): void => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  const blockExternal = (event: { preventDefault: () => void }, url: string) => {
    if (!appOrigin(url)) event.preventDefault();
  };
  contents.on("will-navigate", blockExternal);
  contents.on("will-redirect", blockExternal);
  contents.on("will-attach-webview", (event) => event.preventDefault());
};

/** True only for the app's own page: the dev server origin in dev, the packaged renderer file otherwise. */
export const isAppUrl = (rawUrl: string, options: { devServerOrigin?: string | undefined } = {}): boolean => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (options.devServerOrigin !== undefined) return url.origin === options.devServerOrigin;
  return url.protocol === "file:" && decodeURIComponent(url.pathname).endsWith("/renderer/index.html");
};
