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

/** Drops the Node-API prebuilds of other OS/CPU pairs. */
const driverPrebuilds = "node_modules/better-sqlite3-multiple-ciphers/prebuilds";
const onlyPrebuild = (os: string): string[] => [`!${driverPrebuilds}/!(${os}-\${arch}).node`];

/** Unsigned smoke-build config (M0-10). Signing, notarization and update metadata arrive with the release tickets. */
const config: Configuration = {
  appId: "com.pochimail.desktop",
  productName: "Pochimail",
  // The package name is scoped (@pochimail/desktop); without this the .deb path contains a slash.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder macros, not a JS template
  artifactName: "Pochimail-${version}-${os}-${arch}.${ext}",
  directories: { buildResources: "build", output: "release" },
  // The electron-vite output ships. Renderer deps are devDependencies bundled by Vite, so node_modules only carries the
  // production dependencies that stay external: the SQLite driver (M0-12).
  files: ["out/**", "package.json"],
  // dlopen cannot read a .node file inside app.asar. The driver ships Node-API prebuilds for all six OS/CPU pairs.
  asarUnpack: ["**/node_modules/better-sqlite3-multiple-ciphers/prebuilds/*.node"],
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
    // Both darwin prebuilds stay in both slices: the universal merge needs the same Mach-O files in each, and accepts the identical copies only when listed here.
    files: [`!${driverPrebuilds}/!(darwin-*).node`],
    x64ArchFiles: "**/prebuilds/darwin-*.node",
  },
  win: { target: [{ target: "nsis", arch: "x64" }], files: onlyPrebuild("win32") },
  linux: {
    executableName: linuxExecutableName,
    category: "Office",
    maintainer: "Pochimail contributors <noreply@users.noreply.github.com>",
    target: ["AppImage", "deb", "rpm"],
    files: onlyPrebuild("linux"),
  },
};

export default config;
