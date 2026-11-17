import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const groups = ["apps", "packages", "tooling"];

const workspaces = groups.flatMap((group) =>
  readdirSync(join(root, group))
    .map((name) => join(root, group, name))
    .filter((dir) => existsSync(join(dir, "package.json"))),
);

const sourceFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((entry) => entry !== "node_modules")
        .flatMap((entry) => {
          const path = join(dir, entry);
          return statSync(path).isDirectory()
            ? sourceFiles(path)
            : /\.(ts|tsx)$/.test(entry)
              ? [path]
              : [];
        })
    : [];

const manifest = (dir: string) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

describe("workspace rules (ADR 0001)", () => {
  it("finds every expected workspace", () => {
    const names = workspaces.map((dir) => manifest(dir).name).sort();
    expect(names).toEqual(
      [
        "@pochimail/ai",
        "@pochimail/cli",
        "@pochimail/core",
        "@pochimail/db",
        "@pochimail/desktop",
        "@pochimail/mail",
        "@pochimail/testing",
        "@pochimail/typescript-config",
        "@pochimail/ui",
      ].sort(),
    );
  });

  it("has no root tsconfig", () => {
    expect(readdirSync(root).filter((f) => /^tsconfig.*\.json$/.test(f))).toEqual([]);
  });

  it("uses exports (never main, except the Electron app entry) and stays private", () => {
    for (const dir of workspaces) {
      const pkg = manifest(dir);
      expect(pkg.exports, pkg.name).toBeTypeOf("object");
      // Electron requires `main` to find the app entry; it is not a library entry point.
      if (pkg.name === "@pochimail/desktop") expect(pkg.main).toBe("./out/main/index.js");
      else expect(pkg.main, pkg.name).toBeUndefined();
      expect(pkg.private, pkg.name).toBe(true);
    }
  });

  it("has no barrel file (index.ts) in any package", () => {
    const barrels = workspaces.flatMap((dir) =>
      sourceFiles(dir).filter((f) => /\/index\.tsx?$/.test(f)),
    );
    expect(barrels).toEqual([]);
  });

  it("has no ../ import that leaves its own package", () => {
    const offenders: string[] = [];
    for (const dir of workspaces) {
      for (const file of sourceFiles(dir)) {
        for (const [, spec] of readFileSync(file, "utf8").matchAll(
          /(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']*)["']/g,
        )) {
          if (!resolve(file, "..", spec as string).startsWith(`${dir}/`))
            offenders.push(`${file} -> ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("makes every package tsconfig extend the shared config", () => {
    for (const dir of workspaces.filter((d) => !d.endsWith("tooling/typescript"))) {
      const tsconfig = JSON.parse(readFileSync(join(dir, "tsconfig.json"), "utf8"));
      expect(tsconfig.extends, dir).toMatch(/^@pochimail\/typescript-config\//);
    }
  });

  it("keeps the strict flags in the base config", () => {
    const base = JSON.parse(readFileSync(join(root, "tooling/typescript/base.json"), "utf8"));
    expect(base.compilerOptions).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
    });
  });

  it("reads the repository URL from one place", () => {
    expect(manifest(root).repository.url).toMatch(/github\.com\/jdflament\/pochimail/);
    for (const dir of workspaces) expect(manifest(dir).repository, dir).toBeUndefined();
  });
});
