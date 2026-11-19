import { expect, it } from "vitest";
import {
  countWords,
  docProblems,
  findingsFor,
  judge,
  MAX_LINES,
  missingReadmeSections,
  README_SECTIONS,
} from "./quality-rules.ts";

const rules = (path: string, text: string) => findingsFor([{ path, text }]).map((f) => f.rule);

// Guards: a 600-line god file (like the old sqlite-core.ts) slipping in unnoticed.
it("flags a file longer than the line budget", () => {
  expect(rules("a.ts", "x\n".repeat(MAX_LINES + 5))).toContain("file-too-long");
});

// Guards: hand-typed sizes that drift from the type scale.
it("flags arbitrary Tailwind sizes in markup but not named scale steps", () => {
  expect(rules("a.tsx", `<p className="text-[15px] font-[450]" />`)).toEqual(["arbitrary-size"]);
  expect(rules("a.tsx", `<p className="text-body font-display" />`)).toEqual([]);
});

// Guards: 559 vs 560 breakpoint drift.
it("flags raw container breakpoints", () => {
  expect(rules("a.tsx", `<div className="@max-[560px]:hidden" />`)).toContain("raw-breakpoint");
});

// Guards: colors that skip the light/dark tokens.
it("flags color literals outside the styles folder only", () => {
  expect(rules("src/a.tsx", `<div style={{ color: "#15171A" }} />`)).toContain("raw-color");
  expect(rules("src/styles/theme.ts", `const c = "#15171A";`)).toEqual([]);
  expect(rules("src/a.ts", "// see issue (#123)")).toEqual([]);
});

// Guards: imports that break when a folder moves.
it("flags relative imports that climb three levels or more", () => {
  // Built from parts so workspace-rules (which scans test files too) does not read it as a real import.
  const climb = (levels: number) => `import { x } from "${"../".repeat(levels)}shared/x.ts";`;
  expect(rules("a.ts", climb(3))).toContain("deep-relative-import");
  expect(rules("a.ts", climb(1))).toEqual([]);
});

// Guards: ownerless TODOs.
it("requires a GitHub issue number on TODOs", () => {
  expect(rules("a.ts", "// TODO fix later")).toContain("todo-without-ticket");
  expect(rules("a.ts", "// TODO(M4-15): internal id")).toContain("todo-without-ticket");
  expect(rules("a.ts", "// TODO(#123): wire View summary")).toEqual([]);
  expect(rules("a.ts", "// FIXME(#45): review targets")).toEqual([]);
});

// Guards: the ratchet letting debt grow, or staying loose after debt shrank.
it("fails above the baseline and asks to tighten it below", () => {
  const f = [{ rule: "raw-color" as const, file: "a.tsx", count: 3 }];
  expect(judge(f, { "raw-color|a.tsx": 2 }).regressions).toHaveLength(1);
  expect(judge(f, { "raw-color|a.tsx": 5 }).improvements).toEqual(["raw-color|a.tsx"]);
  expect(judge([], { "raw-color|a.tsx": 1 }).improvements).toHaveLength(1);
});

// Guards: a package nobody can justify (like the placeholder `package-info.ts` packages).
it("requires every README section, and all of them when the README is missing", () => {
  expect(missingReadmeSections(null)).toEqual([...README_SECTIONS]);
  expect(missingReadmeSections(README_SECTIONS.join("\n"))).toEqual([]);
  expect(missingReadmeSections("## Why this package exists\n")).toHaveLength(3);
});

// Guards: documentation sprawl (a second brief, a status log, a 4,000-word ADR).
it("allows only listed documents, within their word budget", () => {
  expect(docProblems([{ path: "AGENTS.md", words: 500 }])).toEqual([]);
  expect(docProblems([{ path: "AGENTS.md", words: 900 }])).toHaveLength(1);
  expect(docProblems([{ path: "docs/status.md", words: 10 }])).toHaveLength(1);
  expect(docProblems([{ path: "docs/adr/0012-delete-to-trash.md", words: 300 }])).toEqual([]);
  expect(docProblems([{ path: "apps/desktop/src/renderer/AGENTS.md", words: 120 }])).toEqual([]);
  expect(docProblems([{ path: "packages/AGENTS.md", words: 120 }])).toEqual([]);
  expect(docProblems([{ path: "packages/mailbox/README.md", words: 120 }])).toEqual([]);
  expect(docProblems([{ path: "CLAUDE.md", words: 1 }])).toHaveLength(1);
});

// Guards: code samples inflating the count.
it("does not count fenced code as words", () => {
  expect(countWords("one two\n```sh\npnpm install && pnpm check\n```\nthree")).toBe(3);
});
