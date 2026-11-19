import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  type Baseline,
  countWords,
  docProblems,
  findingsFor,
  judge,
  keyOf,
  missingReadmeSections,
  type SourceFile,
} from "./quality-rules.ts";

// Run from the repo root: `pnpm quality` (CI), `pnpm quality --update-baseline` (only to shrink it),
// or `--docs-only` (documentation checks alone).
const ROOT = process.cwd();
const BASELINE = join(ROOT, "tooling/ci/quality-baseline.json");
const SCAN = ["apps", "packages", "tooling"].filter((dir) => existsSync(join(ROOT, dir)));
const SKIP_DIR = new Set(["node_modules", "dist", "out", "build", "coverage", "storybook-static"]);
// Not shipped, so not held to production rules.
const SKIP_FILE =
  /\.(test|stories|bench)\.tsx?$|\/(test-support|bench|fixtures|recorded)\/|\.d\.ts$/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
}

const paths: string[] = [];
for (const top of SCAN) walk(join(ROOT, top), paths);
const files: SourceFile[] = paths
  .map((p) => relative(ROOT, p).split(sep).join("/"))
  .filter((p) => !SKIP_FILE.test(p))
  .map((p) => ({ path: p, text: readFileSync(join(ROOT, p), "utf8") }));

const findings = findingsFor(files);

if (process.argv.includes("--update-baseline")) {
  const next: Record<string, number> = {};
  for (const f of findings.sort((a, b) => keyOf(a).localeCompare(keyOf(b))))
    next[keyOf(f)] = f.count;
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(next).length} entries. It may only ever shrink.`);
  process.exit(0);
}

// Every workspace must say why it exists (no baseline: this is cheap to fix and never optional).
const workspaces = SCAN.flatMap((top) =>
  readdirSync(join(ROOT, top))
    .map((name) => join(top, name))
    .filter((dir) => existsSync(join(ROOT, dir, "package.json"))),
);
const readmeGaps = workspaces.flatMap((dir) => {
  const file = join(ROOT, dir, "README.md");
  const missing = missingReadmeSections(existsSync(file) ? readFileSync(file, "utf8") : null);
  return missing.map((section) => `${dir}/README.md is missing "${section}"`);
});
for (const gap of readmeGaps) console.error(`FAIL readme ${gap}`);

// Documentation: a fixed set of files with word budgets (screens' generated HTML is not documentation).
const docPaths: string[] = [];
(function walkDocs(dir: string): void {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (
      SKIP_DIR.has(name) ||
      name === ".git" ||
      (dir === "" && name.startsWith(".") && name !== ".github")
    )
      continue;
    const rel = dir ? `${dir}/${name}` : name;
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (rel !== "docs/design/screens") walkDocs(rel);
    } else if (name.endsWith(".md")) docPaths.push(rel);
  }
})("");
const docIssues = docProblems(
  docPaths.map((path) => ({ path, words: countWords(readFileSync(join(ROOT, path), "utf8")) })),
);
for (const issue of docIssues) console.error(`FAIL docs ${issue}`);

// `--docs-only`: documentation and README checks without the code baseline (used before Q-01 lands).
if (process.argv.includes("--docs-only")) {
  if (readmeGaps.length > 0 || docIssues.length > 0) process.exit(1);
  console.log(`docs: ok (${docPaths.length} documents)`);
  process.exit(0);
}

const baseline: Baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
const { regressions, improvements } = judge(findings, baseline);

for (const r of regressions) {
  console.error(`FAIL ${r.rule} ${r.file}: ${r.count} (allowed ${r.allowed})`);
}
if (improvements.length > 0) {
  console.error(
    `Debt went down in ${improvements.length} place(s). Run \`pnpm quality --update-baseline\` and commit it.`,
  );
}
if (
  regressions.length > 0 ||
  improvements.length > 0 ||
  readmeGaps.length > 0 ||
  docIssues.length > 0
) {
  process.exit(1);
}
console.log(
  `quality: ok (${files.length} files, ${Object.keys(baseline).length} frozen debt entries)`,
);
