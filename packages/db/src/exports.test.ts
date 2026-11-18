import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkgUrl = new URL("../package.json", import.meta.url);
const exportsMap = (JSON.parse(readFileSync(pkgUrl, "utf8")) as { exports: Record<string, string> })
  .exports;

describe("package exports", () => {
  it.each(Object.entries(exportsMap))(
    "%s points at a real file that imports through the public name (guards a dead exports entry)",
    async (subpath, target) => {
      expect(existsSync(new URL(target, pkgUrl))).toBe(true);
      const mod = await import(`@pochimail/db/${subpath.slice(2)}`);
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    },
  );
});
