import { join } from "node:path";
import {
  app,
  BrowserWindow,
  MessageChannelMain,
  nativeTheme,
  session,
  utilityProcess,
} from "electron";
import { hardenWebContents, isAppUrl, isRequestAllowed, webPreferences } from "./security.ts";
import { linkWorkerOnEveryLoad } from "./worker-link.ts";

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const devServerOrigin = devServerUrl === undefined ? undefined : new URL(devServerUrl).origin;
const rendererFile = join(import.meta.dirname, "../renderer/index.html");

/** Session-wide guards: deny all permissions and cancel every request to a host that is not allowlisted. */
const lockDownSession = (): void => {
  const { defaultSession } = session;
  defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  defaultSession.setPermissionCheckHandler(() => false);
  defaultSession.setDevicePermissionHandler(() => false);
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isRequestAllowed(details.url, { devServerOrigin });
    // Log the host only: never a full URL (privacy rules, AGENTS.md §5).
    if (!allowed)
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "request-blocked",
          host: new URL(details.url).host,
        }),
      );
    callback({ cancel: !allowed });
  });
};

const connectWorker = (window: BrowserWindow): void => {
  const worker = utilityProcess.fork(join(import.meta.dirname, "worker.js"), [], {
    serviceName: "pochimail-worker",
  });
  linkWorkerOnEveryLoad(window.webContents, worker, () => new MessageChannelMain());
  window.once("closed", () => worker.kill());
};

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      ...webPreferences,
      preload: join(import.meta.dirname, "../preload/index.cjs"),
    },
  });
  window.once("ready-to-show", () => window.show());
  connectWorker(window);
  if (devServerUrl === undefined) void window.loadFile(rendererFile);
  else void window.loadURL(devServerUrl);
};

app.on("web-contents-created", (_event, contents) =>
  hardenWebContents(contents, (url) => isAppUrl(url, { devServerOrigin })),
);

void app.whenReady().then(() => {
  nativeTheme.themeSource = "system";
  lockDownSession();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
