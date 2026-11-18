import { readFileSync } from "node:fs";
import type { Category } from "@pochimail/core/domain/category";
import type { Classifier } from "@pochimail/core/ports/ai";
import { ok } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";
import { generateMailbox } from "../fixture-mailbox/generator.ts";
import { readMailbox } from "../fixture-mailbox/mailbox-reader.ts";
import { createGroundTruthClassifier } from "../ground-truth-classifier.ts";
import { compareToBaseline } from "./compare.ts";
import { degradeClassifier } from "./degraded-classifier.ts";
import { runEval } from "./harness.ts";
import { scoreMultiLabel, scoreSingleLabel } from "./metrics.ts";
import { type EvalReport, evalReportSchema } from "./report.ts";

const mailbox = generateMailbox({ seed: 20261117, scale: "small" });
const labels = new Map<string, Category>(
  mailbox.labels.messages.map((l) => [l.messageId, l.category]),
);
const truth = () => createGroundTruthClassifier(labels);
const baseline = evalReportSchema.parse(
  JSON.parse(readFileSync(new URL("../../eval/baseline.small.json", import.meta.url), "utf8")),
);

describe("metrics", () => {
  it("hand-computed tiny fixture: precision, recall, support and accuracy are exact (guards a swapped fp/fn)", () => {
    // people: tp 2 (a, b), fn 1 (c predicted records), records: tp 1 (d), fp 1 (c), fn 1 (e unanswered).
    const { perClass, accuracy } = scoreSingleLabel(
      ["people", "records"],
      [
        { expected: "people", predicted: "people" },
        { expected: "people", predicted: "people" },
        { expected: "people", predicted: "records" },
        { expected: "records", predicted: "records" },
        { expected: "records", predicted: undefined },
      ],
    );
    expect(perClass.people).toMatchObject({
      support: 3,
      truePositives: 2,
      falsePositives: 0,
      falseNegatives: 1,
      precision: 1,
      recall: 0.6667,
    });
    expect(perClass.records).toMatchObject({
      support: 2,
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
    expect(accuracy).toBe(0.6);
  });

  it("multi-label signals are scored per kind, so one wrong kind never hides another (guards micro-averaging)", () => {
    const perKind = scoreMultiLabel(
      ["needs-reply", "has-document"],
      [
        { expected: ["needs-reply", "has-document"], predicted: ["needs-reply"] },
        { expected: [], predicted: ["needs-reply"] },
      ],
    );
    expect(perKind["needs-reply"]).toMatchObject({
      truePositives: 1,
      falsePositives: 1,
      precision: 0.5,
      recall: 1,
    });
    expect(perKind["has-document"]).toMatchObject({
      support: 1,
      falseNegatives: 1,
      precision: 1,
      recall: 0,
    });
  });
});

describe("compareToBaseline", () => {
  const worse = (drop: number): EvalReport => ({
    ...baseline,
    categories: {
      ...baseline.categories,
      people: { ...baseline.categories.people, recall: 1 - drop },
    },
  });

  it("a drop inside the tolerance passes and one beyond it fails (guards a gate that is too strict or too loose)", () => {
    expect(compareToBaseline(worse(0.01), baseline).ok).toBe(true);
    const failed = compareToBaseline(worse(0.05), baseline);
    expect(failed.ok).toBe(false);
    expect(failed.regressions).toEqual([
      { group: "category", name: "people", metric: "recall", baseline: 1, current: 0.95 },
    ]);
  });

  it("a report of another fixture never passes (guards comparing numbers that are not comparable)", () => {
    const other = { ...baseline, fixture: { ...baseline.fixture, seed: 1 } };
    expect(compareToBaseline(other, baseline).ok).toBe(false);
  });
});

describe("runEval", () => {
  it("the committed baseline passes and a deliberately degraded classifier fails the comparison", async () => {
    const good = await runEval({ classifier: truth(), mailbox });
    expect(compareToBaseline(good, baseline).ok).toBe(true);

    const bad = await runEval({ classifier: degradeClassifier(truth()), mailbox });
    const comparison = compareToBaseline(bad, baseline);
    expect(comparison.ok).toBe(false);
    expect(comparison.regressions.some((r) => r.group === "category")).toBe(true);
  });

  it("takes any Classifier and counts silence as a miss (guards a harness tied to the stub)", async () => {
    const silent: Classifier = { classify: async () => ok([]) };
    const report = await runEval({ classifier: silent, mailbox });
    expect(report.unclassified).toBe(mailbox.labels.messages.length);
    expect(report.categoryAccuracy).toBe(0);
    expect(report.categories.people.recall).toBe(0);
  });

  it("the report validates against its schema and holds no mail content (guards leaking subjects or addresses, D11)", async () => {
    const report = await runEval({ classifier: truth(), mailbox });
    expect(evalReportSchema.safeParse(report).success).toBe(true);
    expect(evalReportSchema.safeParse({ ...report, schemaVersion: 2 }).success).toBe(false);
    const json = JSON.stringify(report);
    for (const account of mailbox.accounts)
      for (const { message } of readMailbox(account.mbox, {
        accountId: account.id,
        workspaceId: mailbox.workspaceId,
      }).slice(0, 25)) {
        expect(json).not.toContain(message.subject);
        expect(json).not.toContain(message.from);
      }
  });
});
