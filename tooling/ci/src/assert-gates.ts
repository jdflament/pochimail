import { execSync } from "node:child_process";
import { evaluateGate, type GateName } from "./gate-counts.ts";

const gates: GateName[] = ["typecheck", "lint", "test", "build", "knip"];

// Run from the repo root (`pnpm gates`) so turbo sees every workspace. The command string is built
// from the fixed gate list above, never from user input; a shell lets Windows resolve `pnpm.cmd`.
const results = gates.map((gate) => {
  const out = execSync(`pnpm exec turbo run ${gate} --dry=json`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return evaluateGate(gate, out);
});

for (const { gate, count, ok } of results) {
  console.log(`${ok ? "ok  " : "FAIL"} ${gate}: ${count} task(s)`);
}

if (results.some((result) => !result.ok)) {
  console.error("A gate ran zero tasks. Wire it up or fail the build; never pass vacuously.");
  process.exit(1);
}
