import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../../..");

const walk = (root: string, dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(root, path) : [path];
  });

const TESTS = /\.(test|bench|stories)\.tsx?$/;
// An alias (`@pochimail/testing/recorded/...`) or a relative path into the harness folder.
const REACHES_RECORDED =
  /["'`](?:@pochimail\/testing\/recorded\/|(?:\.{1,2}\/)[^"'`]*\/recorded\/)/;

/** Production source files (everything but tests, in apps and packages except `testing`) that reach `recorded/*`. */
export function findRecordedImports(root: string): string[] {
  return ["apps", "packages"]
    .flatMap((top) => readdirSync(join(root, top)).map((d) => `${top}/${d}/src`))
    .filter((dir) => dir !== "packages/testing/src")
    .flatMap((dir) => {
      try {
        return walk(root, dir);
      } catch {
        return [];
      }
    })
    .filter((file) => /\.tsx?$/.test(file) && !TESTS.test(file))
    .filter((file) => REACHES_RECORDED.test(readFileSync(join(root, file), "utf8")));
}

describe("the recorded-fixture harness stays dev/test only", () => {
  it("production source never imports recorded/* by alias or relative path (guards a replay or scripted IMAP server bundled into the app)", () => {
    expect(findRecordedImports(repoRoot)).toEqual([]);
  });

  it("fails on planted violations, including a *-contract.ts file and a relative import", () => {
    const root = mkdtempSync(join(tmpdir(), "pochimail-guard-"));
    const plant = (path: string, source: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    };
    try {
      plant("apps/a/src/alias.ts", 'import "@pochimail/testing/recorded/scrub";\n');
      plant(
        "apps/a/src/relative.ts",
        'import "../../../packages/testing/src/recorded/scrub.ts";\n',
      );
      plant(
        "packages/b/src/leak-contract.ts",
        'import("@pochimail/testing/recorded/http-replay");\n',
      );
      plant("packages/b/src/fine.ts", 'import "@pochimail/testing/contract";\n');
      plant("packages/b/src/ok.test.ts", 'import "@pochimail/testing/recorded/scrub";\n');
      mkdirSync(join(root, "packages/testing/src"), { recursive: true });
      expect(findRecordedImports(root).sort()).toEqual([
        "apps/a/src/alias.ts",
        "apps/a/src/relative.ts",
        "packages/b/src/leak-contract.ts",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
