import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const importsOf = (source: string) =>
  [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");

describe("worker architecture", () => {
  it("handlers import core use cases and types only, never repositories, adapters or the testing package (guards business logic creeping into handlers)", () => {
    const imports = importsOf(read("./handlers.ts"));
    for (const path of imports) {
      const allowed =
        path.startsWith("@pochimail/core/use-cases/") ||
        path === "@pochimail/core/ids" ||
        path === "@pochimail/core/domain/account" ||
        path === "@pochimail/core/events/catalog" ||
        path === "@pochimail/core/ports/event-bus" ||
        path === "@pochimail/core/ports/platform" ||
        path === "../shared/ipc/contract.ts" ||
        path === "../shared/ipc/server.ts";
      expect(allowed, `handlers.ts must not import ${path}`).toBe(true);
    }
    const source = read("./handlers.ts");
    expect(source).not.toMatch(/\.reads\b|\buow\b|\.repositories\b|\bnew (Run|Build|Summarize)/);
  });

  it("only the fixture module and the entry point may name the testing package, and the entry loads it on demand (guards fixtures shipping in the normal path)", () => {
    for (const file of ["./app.ts", "./handlers.ts", "./model-host-client.ts"])
      expect(importsOf(read(file)).some((p) => p.startsWith("@pochimail/testing"))).toBe(false);
    const entry = read("./worker.ts");
    expect(importsOf(entry).some((p) => p.includes("fixture-adapters"))).toBe(false);
    expect(entry).toContain('import("./fixture-adapters.ts")');
  });
});
