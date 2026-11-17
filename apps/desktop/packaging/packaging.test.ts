import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { electronBinaryPath, isUniversalSlice } from "./apply-fuses.ts";
import { sizeTable } from "./size-report.ts";

const app = { appOutDir: "release/x", productFilename: "Pochimail", executableName: "pochimail" };

describe("fuse target", () => {
  // Guards: fuses flipped on the wrong file (or not at all) so the shipped binary keeps RunAsNode.
  it.each([
    ["darwin", join("release/x", "Pochimail.app", "Contents", "MacOS", "Pochimail")],
    ["win32", join("release/x", "Pochimail.exe")],
    ["linux", join("release/x", "pochimail")],
  ])("points at the Electron binary on %s", (platform, expected) => {
    expect(electronBinaryPath({ ...app, platform })).toBe(expected);
  });

  it("refuses an unknown platform instead of skipping the fuses silently", () => {
    expect(() => electronBinaryPath({ ...app, platform: "freebsd" })).toThrow(/Unsupported/);
  });

  // Guards: re-signing each universal slice differently, which makes the universal merge fail.
  it("recognises the per-arch slices of a universal macOS build", () => {
    expect(isUniversalSlice("release/mac-universal-x64-temp")).toBe(true);
    expect(isUniversalSlice("release/mac-universal-arm64-temp")).toBe(true);
    expect(isUniversalSlice("release/mac-universal")).toBe(false);
  });
});

describe("size report", () => {
  // Guards: a job summary that lists blockmaps or update metadata, or passes with no artifact at all.
  it("lists installers in megabytes and ignores metadata", () => {
    const table = sizeTable("macOS", [
      { name: "Pochimail-0.0.0-universal.dmg", bytes: 226_086_302 },
      { name: "Pochimail-0.0.0-universal.dmg.blockmap", bytes: 9 },
      { name: "latest-mac.yml", bytes: 9 },
    ]);
    expect(table).toContain("| Pochimail-0.0.0-universal.dmg | 215.6 MB |");
    expect(table).not.toContain("blockmap");
    expect(table).not.toContain("latest-mac");
  });

  it("fails when no installer was produced", () => {
    expect(() => sizeTable("Linux", [{ name: "builder-debug.yml", bytes: 1 }])).toThrow(
      /No installer/,
    );
  });
});
