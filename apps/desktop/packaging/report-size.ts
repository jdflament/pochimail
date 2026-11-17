import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { listArtifacts, sizeTable } from "./size-report.ts";

/** Prints the artifact size table and appends it to the GitHub job summary when running in CI. */
const table = sizeTable(
  process.argv[2] ?? "Packaging artifacts",
  listArtifacts(join(import.meta.dirname, "..", "release")),
);
console.log(table);
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary !== undefined) appendFileSync(summary, `${table}\n`);
