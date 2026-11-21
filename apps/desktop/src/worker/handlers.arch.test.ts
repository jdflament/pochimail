import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const importsOf = (source: string) =>
  [...source.matchAll(/(?:from|import\()\s*"([^"]+)"/g)].map((match) => match[1] ?? "");

describe("worker architecture", () => {
  it("handlers import use cases and types only, never repositories, adapters or the testing package (guards business logic creeping into handlers)", () => {
    const imports = importsOf(read("./handlers.ts"));
    for (const path of imports) {
      const allowed =
        path.startsWith("@pochimail/workflows/use-cases/") ||
        path.startsWith("@pochimail/classification/use-cases/") ||
        path.startsWith("@pochimail/cleanup/use-cases/") ||
        path === "./manage-settings.ts" ||
        path === "@pochimail/accounts/model/account" ||
        path.startsWith("@pochimail/accounts/use-cases/") ||
        path === "@pochimail/workflows/events" ||
        path === "@pochimail/kernel/ids" ||
        path === "@pochimail/pipeline/event-bus" ||
        path === "../shared/platform-port.ts" ||
        path === "../shared/ipc/contract.ts" ||
        path === "../shared/ipc/server.ts";
      expect(allowed, `handlers.ts must not import ${path}`).toBe(true);
    }
    const source = read("./handlers.ts");
    expect(source).not.toMatch(/\.reads\b|\buow\b|\.repositories\b|\bnew (Run|Build|Summarize)/);
  });

  it("only the fixture module and the entry point may name the testing package, and the entry loads it on demand (guards fixtures shipping in the normal path)", () => {
    const testing = (file: string) =>
      importsOf(read(file)).some((p) => p.startsWith("@pochimail/testing"));
    for (const file of [
      "./app.ts",
      "./handlers.ts",
      "./model-host-client.ts",
      "../model-host/serve.ts",
      "../model-host/engine.ts",
      "../model-host/model-host.ts",
    ])
      expect(testing(file), `${file} must not import the testing package`).toBe(false);
    // These two are the fixture code; everything else reaches them only through a dynamic import().
    expect(testing("./fixture-adapters.ts")).toBe(true);
    expect(testing("../model-host/fixture-engine.ts")).toBe(true);
    const staticImports = (file: string) =>
      [...read(file).matchAll(/^import .*from "([^"]+)"/gm)].map((m) => m[1] ?? "");
    for (const file of ["./worker.ts", "../model-host/engine.ts", "../model-host/model-host.ts"])
      expect(
        staticImports(file).some((p) => p.includes("fixture-")),
        `${file} must load fixtures on demand`,
      ).toBe(false);
    expect(read("./worker.ts")).toContain('import("./fixture-adapters.ts")');
    expect(read("../model-host/engine.ts")).toContain('import("./fixture-engine.ts")');
  });
});
