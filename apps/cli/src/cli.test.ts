import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AiUnavailable } from "@pochimail/core/errors";
import { err } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";
import { formatSummary } from "./format.ts";
import { main } from "./main.ts";
import { runScenario } from "./scenario.ts";

const golden = readFileSync(new URL("./golden/mock-small.txt", import.meta.url), "utf8");
const cliDir = fileURLToPath(new URL("..", import.meta.url));

async function run(argv: string[], overrides?: Parameters<typeof main>[2]) {
  const lines: string[] = [];
  const code = await main(argv, (l) => lines.push(l), overrides);
  return { code, text: `${lines.join("\n")}\n` };
}

// Each test runs the whole pipeline (about 1 s here, several on a loaded CI runner).
const SLOW = 60_000;

describe("pochi:run fixtures/mock", () => {
  it(
    "exits 0 and prints the committed summary (a changed pipeline result must be a visible diff)",
    async () => {
      const { code, text } = await run(["fixtures/mock"]);
      expect(code).toBe(0);
      expect(text).toBe(golden);
    },
    SLOW,
  );

  it(
    "runs as a real command and exits 0 with the same summary (CI integration)",
    () => {
      const stdout = execFileSync(
        process.execPath,
        ["--import", "tsx", "src/main.ts", "fixtures/mock"],
        {
          cwd: cliDir,
          encoding: "utf8",
        },
      );
      expect(stdout).toBe(golden);
    },
    SLOW,
  );

  it(
    "restores the mailbox exactly after undo (undo that leaves archived mail behind)",
    async () => {
      const r = await runScenario({ scale: "small" });
      // Guards a vacuous pass: apply must really have changed the mailbox first.
      expect(r.applied.some((o) => o.status === "applied")).toBe(true);
      expect(r.changedByApply).toBe(true);
      expect(r.undone.every((o) => o.status === "undone")).toBe(true);
      expect(r.mailboxRestored).toBe(true);
    },
    SLOW,
  );

  it(
    "exits non-zero when a pipeline stage fails (a swallowed stage error that still exits 0)",
    async () => {
      const { code, text } = await run(["fixtures/mock"], {
        wrapClassifier: () => ({ classify: async () => err(new AiUnavailable()) }),
      });
      expect(code).toBe(1);
      expect(text).toMatch(/^error: /m);
    },
    SLOW,
  );

  it(
    "prints a usage line and exits 2 for an unknown dataset",
    async () => {
      expect((await run(["fixtures/nope"])).code).toBe(2);
    },
    SLOW,
  );

  it(
    "pausing mid-run and resuming gives the same final summary (a pause that loses or repeats a batch)",
    async () => {
      const straight = await runScenario({ scale: "small" });
      const paused = await runScenario({ scale: "small", pauseAfterBatches: 2 });
      expect(paused.scan.pauses).toBeGreaterThanOrEqual(1);
      const body = (r: typeof straight) =>
        formatSummary("fixtures/mock", r).filter((l) => !l.startsWith("sync "));
      expect(body(paused)).toEqual(body(straight));
      expect(paused.scan.batches).toBe(straight.scan.batches);
    },
    SLOW,
  );
});
