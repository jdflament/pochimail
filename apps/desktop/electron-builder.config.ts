import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import { applyFuses } from "./packaging/apply-fuses.ts";

/** The repository URL lives in the root package.json only (AGENTS.md); .deb metadata needs a homepage, derived from it. */
const rootManifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "..", "package.json"), "utf8"),
) as { repository: { url: string } };
const homepage = rootManifest.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

/** Pinned so the fuse step and the smoke script can find the Linux binary. */
const linuxExecutableName = "pochimail";

/** Unsigned smoke-build config (M0-10). Signing, notarization and update metadata arrive with the release tickets. */
const config: Configuration = {
  appId: "com.pochimail.desktop",
  productName: "Pochimail",
  directories: { buildResources: "build", output: "release" },
  // Only the electron-vite output ships: renderer deps are bundled by Vite, so node_modules stays out of the asar.
  files: ["out/**", "package.json", "!node_modules/**"],
  extraMetadata: { homepage },
  asar: true,
  // Native modules (SQLite driver, node-llama-cpp, onnxruntime-node) are rebuilt for Electron per OS and CPU here.
  npmRebuild: true,
  afterPack: async (context) => {
    await applyFuses({
      platform: context.electronPlatformName,
      appOutDir: context.appOutDir,
      productFilename: context.packager.appInfo.productFilename,
      executableName: linuxExecutableName,
    });
  },
  mac: {
    category: "public.app-category.productivity",
    target: [
      { target: "dmg", arch: "universal" },
      { target: "zip", arch: "universal" },
    ],
    identity: null,
  },
  win: { target: [{ target: "nsis", arch: "x64" }] },
  linux: {
    executableName: linuxExecutableName,
    category: "Office",
    maintainer: "Pochimail contributors <noreply@users.noreply.github.com>",
    target: ["AppImage", "deb", "rpm"],
  },
};

export default config;
