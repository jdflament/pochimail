import { join } from "node:path";
import { flipFuses } from "@electron/fuses";
import { fuses } from "../src/main/fuses.ts";

export type PackagedApp = {
  platform: string;
  appOutDir: string;
  productFilename: string;
  executableName: string;
};

/** Where electron-builder leaves the Electron binary that Fuses must be flipped on, per OS. */
export const electronBinaryPath = (app: PackagedApp): string => {
  switch (app.platform) {
    case "darwin":
      return join(
        app.appOutDir,
        `${app.productFilename}.app`,
        "Contents",
        "MacOS",
        app.productFilename,
      );
    case "win32":
      return join(app.appOutDir, `${app.productFilename}.exe`);
    case "linux":
      return join(app.appOutDir, app.executableName);
    default:
      throw new Error(`Unsupported platform for fuses: ${app.platform}`);
  }
};

/** electron-builder packs each CPU slice of a macOS universal app into `<dir>-<arch>-temp`, then merges them. */
export const isUniversalSlice = (appOutDir: string): boolean =>
  /-(x64|arm64)-temp$/.test(appOutDir);

/**
 * Applies the Fuses from ADR 0002 to the unpacked app; runs in electron-builder's `afterPack`, before installers are made.
 * Universal slices are skipped: flipping them re-signs each differently and the merge then fails. The merged app gets its own `afterPack`.
 */
export const applyFuses = async (app: PackagedApp): Promise<void> => {
  if (isUniversalSlice(app.appOutDir)) return;
  await flipFuses(electronBinaryPath(app), fuses);
};
