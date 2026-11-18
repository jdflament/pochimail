import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@pochimail/core/logger";
import {
  app,
  BrowserWindow,
  MessageChannelMain,
  nativeImage,
  nativeTheme,
  safeStorage,
  session,
  utilityProcess,
} from "electron";
import { createSecretVault, type SecretVault } from "./secret-vault.ts";
import { hardenWebContents, isAppUrl, isRequestAllowed, webPreferences } from "./security.ts";
import { keyProtection, loadOrCreateDatabaseKey } from "./storage-key.ts";
import { linkWorkerOnEveryLoad } from "./worker-link.ts";
import { bootWorker } from "./worker-start.ts";

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const devServerOrigin = devServerUrl === undefined ? undefined : new URL(devServerUrl).origin;
const rendererFile = join(import.meta.dirname, "../renderer/index.html");
// Dev only: a packaged app gets its icon from the installer (electron-builder, apps/desktop/build); `electron .` would show Electron's.
const devIconPath = app.isPackaged ? undefined : join(import.meta.dirname, "../../build/icon.png");

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

// Redacted records only (core logger allow-list); structured JSON, same shape as the request-blocked warning.
const logger = createLogger({
  sink: {
    write: (record) =>
      console.warn(
        JSON.stringify({ level: record.level, message: record.message, ...record.fields }),
      ),
  },
});
const DATABASE_FILE = "pochimail.db";

// One vault per process: every window's worker shares its write queue, so concurrent updates never lose an entry.
let secretVault: SecretVault | undefined;
const processSecretVault = (): SecretVault => {
  secretVault ??= createSecretVault({
    vault: safeStorage,
    file: join(app.getPath("userData"), "secrets.json"),
    platform: process.platform,
    logger,
  });
  return secretVault;
};

const connectWorker = (window: BrowserWindow): void => {
  const worker = utilityProcess.fork(join(import.meta.dirname, "worker.js"), [], {
    serviceName: "pochimail-worker",
  });
  linkWorkerOnEveryLoad(window.webContents, worker, () => new MessageChannelMain());
  const userData = app.getPath("userData");
  void bootWorker({
    worker,
    secrets: processSecretVault(),
    loadKey: () =>
      loadOrCreateDatabaseKey(
        safeStorage,
        join(userData, "db.key"),
        process.platform,
        join(userData, DATABASE_FILE),
      ),
    createChannel: () => new MessageChannelMain(),
    logger,
  });
  window.once("closed", () => worker.kill());
};

/** Packaging smoke (M0-12): key from safeStorage, then the encrypted-database proof inside a utilityProcess of the packaged app. */
const smokeStorage = async (): Promise<void> => {
  const dir = mkdtempSync(join(tmpdir(), "pochimail-smoke-"));
  const protection = await keyProtection(safeStorage, process.platform);
  // Without a keychain (Linux basic_text) the real app must ask first; the smoke still proves the driver with a throwaway key.
  const loaded = await loadOrCreateDatabaseKey(
    safeStorage,
    join(dir, "db.key"),
    process.platform,
    join(dir, "smoke.db"),
  );
  const key = (loaded.ok ? loaded.value : undefined) ?? randomBytes(32);
  const child = utilityProcess.fork(join(import.meta.dirname, "storage-smoke.js"), [], {
    serviceName: "pochimail-storage-smoke",
  });
  try {
    const result = await new Promise<unknown>((resolve) => {
      child.once("message", resolve);
      child.once("exit", (code) =>
        resolve({ ok: false, error: `storage worker exited with ${code}` }),
      );
      child.postMessage({
        path: join(dir, "smoke.db"),
        keyHex: key.toString("hex"),
        rows: 100_000,
      });
    });
    console.log(`smoke:storage ${JSON.stringify({ protection, result })}`);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
};

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    ...(devIconPath !== undefined && process.platform !== "darwin" ? { icon: devIconPath } : {}),
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
  // Packaging smoke test (M0-10): report that the renderer loaded, then quit.
  if (process.env.POCHIMAIL_SMOKE === "1")
    window.webContents.once("did-finish-load", () => {
      console.log("smoke:window-loaded");
      void smokeStorage().finally(() => app.quit());
    });
  if (devServerUrl === undefined) void window.loadFile(rendererFile);
  else void window.loadURL(devServerUrl);
};

app.on("web-contents-created", (_event, contents) =>
  hardenWebContents(contents, (url) => isAppUrl(url, { devServerOrigin })),
);

void app.whenReady().then(() => {
  nativeTheme.themeSource = "system";
  if (devIconPath !== undefined && process.platform === "darwin")
    app.dock?.setIcon(nativeImage.createFromPath(devIconPath));
  lockDownSession();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
