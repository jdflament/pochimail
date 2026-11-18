import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = `${dir}/${name}`;
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });

// The demo mailbox (`fixture-mailbox/*`) ships on purpose in dev builds (apps/desktop/src/shared/demo.ts).
// The record/replay harness below it never may: it opens sockets and serves canned provider traffic.
describe("the recorded-fixture harness stays dev/test only", () => {
  it("production source never imports @pochimail/testing/recorded/* (guards a replay or scripted IMAP server bundled into the app)", () => {
    const offenders = ["apps", "packages"]
      .flatMap((top) => readdirSync(join(root, top)).map((d) => `${top}/${d}/src`))
      .filter((dir) => !dir.startsWith("packages/testing/"))
      .flatMap((dir) => {
        try {
          return walk(dir);
        } catch {
          return [];
        }
      })
      .filter((file) => /\.(ts|tsx)$/.test(file))
      // Tests and exported contract suites (`*-contract.ts`) are dev-only by definition.
      .filter((file) => !/\.(test|bench|stories)\.tsx?$|-contract\.ts$|\/test-|\.test-/.test(file))
      .filter((file) => read(file).includes("@pochimail/testing/recorded/"));
    expect(offenders).toEqual([]);
  });
});
