import { formatSummary, problems } from "./format.ts";
import { runScenario, type ScenarioOptions } from "./scenario.ts";

/** Datasets the command knows. `fixtures/mock` is the 1 % mock mailbox; `--scale full` is brief §6 whole. */
const DATASETS = ["fixtures/mock"];

export async function main(
  argv: readonly string[],
  out: (line: string) => void,
  overrides: Pick<ScenarioOptions, "wrapClassifier"> = {},
): Promise<number> {
  const dataset = argv.find((a) => !a.startsWith("--"));
  const scale = argv.includes("--scale=full") ? "full" : "small";
  const pause = argv.find((a) => a.startsWith("--pause-after="))?.split("=")[1];
  if (dataset === undefined || !DATASETS.includes(dataset)) {
    out(`usage: pochi:run ${DATASETS.join("|")} [--scale=full] [--pause-after=<batches>]`);
    return 2;
  }
  try {
    const result = await runScenario({
      scale,
      ...overrides,
      ...(pause === undefined ? {} : { pauseAfterBatches: Number(pause) }),
    });
    for (const line of formatSummary(dataset, result)) out(line);
    const failures = problems(result);
    for (const f of failures) out(`error: ${f}`);
    return failures.length === 0 ? 0 : 1;
  } catch (error) {
    out(
      `error: a pipeline stage failed (${error instanceof Error ? error.name : "unknown"}: ${error instanceof Error ? error.message : ""})`,
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2), (line) => console.log(line));
}
