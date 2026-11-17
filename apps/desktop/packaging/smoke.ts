import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FuseState, FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { fuses } from "../src/main/fuses.ts";
import { electronBinaryPath } from "./apply-fuses.ts";

/** Smoke test of a packaged build: fuses are flipped on the binary and the app starts, loads its window and quits. */
const releaseDir = join(import.meta.dirname, "..", "release");
const unpackedDirs: Record<string, string[]> = {
  darwin: ["mac-universal"],
  win32: ["win-unpacked"],
  linux: ["linux-unpacked"],
};

const appOutDir = (unpackedDirs[process.platform] ?? [])
  .map((name) => join(releaseDir, name))
  .find((dir) => existsSync(dir));
if (appOutDir === undefined) {
  throw new Error(
    `No unpacked app in ${releaseDir} (found: ${readdirSync(releaseDir).join(", ")})`,
  );
}
const binary = electronBinaryPath({
  platform: process.platform,
  appOutDir,
  productFilename: "Pochimail",
  executableName: "pochimail",
});

const wire = await getCurrentFuseWire(binary);
const expected = {
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
} as const;
for (const [option, enabled] of Object.entries(expected)) {
  const actual = wire[Number(option) as keyof typeof wire];
  if (actual !== (enabled ? FuseState.ENABLE : FuseState.DISABLE)) {
    throw new Error(`Fuse ${FuseV1Options[Number(option)]} is ${FuseState[actual as number]}`);
  }
}
if (Object.keys(expected).length !== Object.keys(fuses).filter((k) => /^\d+$/.test(k)).length) {
  throw new Error("smoke.ts fuse list is out of sync with src/main/fuses.ts");
}
console.log("fuses: ok");

// Headless launch: Linux CI wraps this script in xvfb-run and its chrome-sandbox helper is not setuid, hence --no-sandbox there only. The app quits itself once the window has loaded.
const child = spawn(binary, process.platform === "linux" ? ["--no-sandbox"] : [], {
  env: { ...process.env, POCHIMAIL_SMOKE: "1" },
  stdio: ["ignore", "pipe", "inherit"],
});
let output = "";
child.stdout.on("data", (chunk: Buffer) => {
  output += chunk.toString();
});
const timer = setTimeout(() => child.kill(), 60_000);
const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
clearTimeout(timer);
if (code !== 0 || !output.includes("smoke:window-loaded")) {
  throw new Error(`App did not start cleanly (exit ${code}). Output: ${output}`);
}
console.log("launch: ok");
