import { z } from "zod";

/** Counts and ratios of one class (a category or a signal kind). */
export const classMetricsSchema = z.object({
  /** How many messages truly belong to the class. */
  support: z.int().nonnegative(),
  truePositives: z.int().nonnegative(),
  falsePositives: z.int().nonnegative(),
  falseNegatives: z.int().nonnegative(),
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
});
export type ClassMetrics = z.infer<typeof classMetricsSchema>;

/** Ratios are stored with 4 decimals so a report is byte-stable across platforms. */
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Precision is 1 when nothing was predicted and recall is 1 when nothing was expected: an empty
 * class cannot be wrong by itself, and a false positive on it still lowers precision.
 */
export function metricsFromCounts(counts: {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}): ClassMetrics {
  const { truePositives: tp, falsePositives: fp, falseNegatives: fn } = counts;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    support: tp + fn,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
  };
}

/** One message with a single label (category). `predicted` is `undefined` when nothing answered. */
export interface SingleLabelSample<C extends string> {
  readonly expected: C;
  readonly predicted: C | undefined;
}

/** One message with a set of labels (signals). */
export interface MultiLabelSample<C extends string> {
  readonly expected: readonly C[];
  readonly predicted: readonly C[];
}

const tally = () => ({ truePositives: 0, falsePositives: 0, falseNegatives: 0 });

export function scoreSingleLabel<C extends string>(
  classes: readonly C[],
  samples: readonly SingleLabelSample<C>[],
): { perClass: Record<C, ClassMetrics>; accuracy: number } {
  const counts = new Map(classes.map((c) => [c, tally()]));
  let correct = 0;
  for (const { expected, predicted } of samples) {
    if (predicted === expected) {
      correct++;
      const hit = counts.get(expected);
      if (hit) hit.truePositives++;
      continue;
    }
    const missed = counts.get(expected);
    if (missed) missed.falseNegatives++;
    const wrong = predicted === undefined ? undefined : counts.get(predicted);
    if (wrong) wrong.falsePositives++;
  }
  return {
    perClass: Object.fromEntries(
      classes.map((c) => [c, metricsFromCounts(counts.get(c) ?? tally())]),
    ) as Record<C, ClassMetrics>,
    accuracy: samples.length === 0 ? 1 : round(correct / samples.length),
  };
}

export function scoreMultiLabel<C extends string>(
  classes: readonly C[],
  samples: readonly MultiLabelSample<C>[],
): Record<C, ClassMetrics> {
  const counts = new Map(classes.map((c) => [c, tally()]));
  for (const { expected, predicted } of samples) {
    const want = new Set(expected);
    const got = new Set(predicted);
    for (const [c, n] of counts) {
      if (want.has(c) && got.has(c)) n.truePositives++;
      else if (got.has(c)) n.falsePositives++;
      else if (want.has(c)) n.falseNegatives++;
    }
  }
  return Object.fromEntries(
    classes.map((c) => [c, metricsFromCounts(counts.get(c) ?? tally())]),
  ) as Record<C, ClassMetrics>;
}
