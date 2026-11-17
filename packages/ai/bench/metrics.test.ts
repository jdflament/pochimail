import { expect, it } from "vitest";
import { classificationReport, percentile } from "./metrics.ts";

// Guards: macro-F1 must punish a model that never predicts a class (an "invalid" output counts as a miss, not as skipped).
it("computes per-class precision/recall and counts invalid outputs as errors", () => {
  const report = classificationReport(
    [
      { expected: "a", predicted: "a" },
      { expected: "a", predicted: "invalid" },
      { expected: "b", predicted: "a" },
      { expected: "b", predicted: "b" },
    ],
    ["a", "b", "c"],
  );
  expect(report.accuracy).toBe(0.5);
  expect(report.perClass.a).toMatchObject({ precision: 0.5, recall: 0.5, support: 2 });
  expect(report.perClass.b).toMatchObject({ precision: 1, recall: 0.5 });
  // "c" has no support and is excluded from the macro average.
  expect(report.macroF1).toBeCloseTo((0.5 + 2 / 3) / 2);
});

it("takes percentiles without mutating its input", () => {
  const values = [5, 1, 3];
  expect(percentile(values, 50)).toBe(3);
  expect(values).toEqual([5, 1, 3]);
});
