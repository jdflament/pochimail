import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = join(import.meta.dirname, "assert-gates.ts");
const localBin = join(import.meta.dirname, "../../../node_modules/.bin");
const GATES = ["typecheck", "lint", "test", "build", "knip", "eval"];
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const write = (path: string, value: unknown) =>
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));

/** A throwaway monorepo: one workspace per entry, `scripts` undefined for a workspace with no source. */
function fixture(workspaces: Record<string, Record<string, string> | undefined>): string {
  const root = mkdtempSync(join(tmpdir(), "pochimail-gates-"));
  dirs.push(root);
  write(join(root, "package.json"), {
    name: "fixture",
    private: true,
    packageManager: "pnpm@12.21.0",
  });
  write(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  write(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  write(join(root, "turbo.json"), { tasks: Object.fromEntries(GATES.map((g) => [g, {}])) });
  for (const [name, scripts] of Object.entries(workspaces)) {
    mkdirSync(join(root, "packages", name), { recursive: true });
    write(join(root, "packages", name, "package.json"), { name, version: "0.0.0", scripts });
  }
  return root;
}

// Each run spawns node, which spawns turbo six times (one dry run per gate): real process and file
// I/O that takes 5 to 6 s on the macOS and Windows runners, so these tests get a longer timeout.
const SPAWN_TIMEOUT_MS = 60_000;

// Runs the real entry point (`pnpm gates`) from the fixture root, as CI runs it from the repo root.
function assertGates(cwd: string) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
    env: { ...process.env, PATH: `${localBin}${delimiter}${process.env.PATH}` },
  });
}

const allGates = Object.fromEntries(GATES.map((g) => [g, "true"]));

// Guards: a workspace with no source (no scripts at all) failing the gates its siblings run.
it(
  "passes when one workspace has no source beside workspaces that run every gate",
  () => {
    const run = assertGates(fixture({ real: allGates, empty: undefined }));
    expect(run.status, run.stderr).toBe(0);
    for (const gate of GATES) expect(run.stdout).toContain(`ok   ${gate}: 1 task(s)`);
  },
  SPAWN_TIMEOUT_MS,
);

// Guards: the same entry passing vacuously when no workspace runs a gate.
it(
  "fails when no workspace runs the gates",
  () => {
    const run = assertGates(fixture({ empty: undefined }));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A gate ran zero tasks");
  },
  SPAWN_TIMEOUT_MS,
);
