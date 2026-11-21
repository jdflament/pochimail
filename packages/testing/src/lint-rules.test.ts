import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
// Run biome's JS entry through node: `.bin/biome` is a shell shim that spawnSync cannot run on Windows.
const biome = createRequire(join(root, "package.json")).resolve("@biomejs/biome/bin/biome");

// A sandbox outside the repo holding the real biome.json, so probe files never reach the repo's own gates.
const sandbox = mkdtempSync(join(tmpdir(), "pochimail-lint-"));
const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"));
config.vcs = { enabled: false };
delete config.$schema;
writeFileSync(join(sandbox, "biome.json"), JSON.stringify(config));

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** Lints `source` as if it lived at `path` (repo-relative) and reports whether lint failed. */
const lint = (path: string, source: string) => {
  const file = join(sandbox, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  const run = spawnSync(process.execPath, [biome, "lint", path], {
    cwd: sandbox,
    encoding: "utf8",
  });
  if (run.status === null) throw new Error(`biome did not run: ${run.error}`);
  return { failed: run.status !== 0 };
};

describe("lint rules (AGENTS.md §3, §4)", () => {
  it("rejects node:* imports in packages/actions (domain code must stay pure)", () => {
    expect(
      lint("packages/actions/src/a.ts", 'import fs from "node:fs";\nexport const x = fs;\n').failed,
    ).toBe(true);
  });

  it("rejects electron imports in packages/actions", () => {
    expect(
      lint("packages/actions/src/b.ts", 'import { app } from "electron";\nexport const x = app;\n')
        .failed,
    ).toBe(true);
  });

  it("accepts clean code in packages/actions, and node:* outside it (the rule is scoped, not global)", () => {
    expect(lint("packages/actions/src/c.ts", "export const x = 1;\n").failed).toBe(false);
    expect(
      lint("packages/db/src/d.ts", 'import fs from "node:fs";\nexport const x = fs;\n').failed,
    ).toBe(false);
  });

  it("rejects explicit any", () => {
    expect(lint("packages/db/src/e.ts", "export const x: any = 1;\n").failed).toBe(true);
  });

  it("rejects barrel files that re-export", () => {
    expect(lint("packages/db/src/index.ts", 'export * from "./other";\n').failed).toBe(true);
  });
});
