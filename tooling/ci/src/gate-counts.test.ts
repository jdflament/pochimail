import { countTasks, evaluateGate } from "@pochimail/ci/gate-counts";
import { expect, it } from "vitest";

const real = { taskId: "core#lint", command: "biome check ." };
const missing = { taskId: "core#build", command: "<NONEXISTENT>" };
const payload = (...tasks: object[]) => JSON.stringify({ tasks });

// Guards: turbo exits 0 with "0 total" when no workspace defines the script; a gate must not pass.
it("fails a gate whose workspaces define no script for it", () => {
  const result = evaluateGate("lint", payload(missing, missing), new Set());
  expect(result).toEqual({ gate: "lint", count: 0, ok: false });
});

// Guards: counting tasks that exist only as turbo placeholders inflates the count.
it("counts only tasks that run a real command", () => {
  expect(countTasks(payload(real, missing, real))).toBe(2);
});

it("passes a gate that runs at least one task", () => {
  expect(evaluateGate("test", payload(real), new Set()).ok).toBe(true);
});

// Guards: a gate (e.g. build) silently losing all its tasks must fail CI once nothing is exempt.
it("lets no gate run empty by default", () => {
  for (const gate of ["typecheck", "lint", "test", "build", "knip"] as const) {
    expect(evaluateGate(gate, payload(missing)).ok, gate).toBe(false);
  }
});

// Guards: garbage turbo output (e.g. an error banner) must not read as "0 tasks, fine".
it("rejects output that is not a turbo dry-run", () => {
  expect(() => countTasks("{}")).toThrow(/dry-run/);
});
