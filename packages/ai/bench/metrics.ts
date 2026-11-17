interface ClassMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ClassificationReport {
  accuracy: number;
  macroF1: number;
  perClass: Record<string, ClassMetrics>;
}

/** Precision/recall/F1 per label plus accuracy and macro-F1 (labels with no support are skipped in the macro average). */
export function classificationReport(
  pairs: readonly { expected: string; predicted: string }[],
  labels: readonly string[],
): ClassificationReport {
  const perClass: Record<string, ClassMetrics> = {};
  let correct = 0;
  for (const p of pairs) if (p.expected === p.predicted) correct++;
  for (const label of labels) {
    const tp = pairs.filter((p) => p.expected === label && p.predicted === label).length;
    const fp = pairs.filter((p) => p.expected !== label && p.predicted === label).length;
    const fn = pairs.filter((p) => p.expected === label && p.predicted !== label).length;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    perClass[label] = {
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      support: tp + fn,
    };
  }
  const supported = labels.filter((l) => (perClass[l]?.support ?? 0) > 0);
  const macroF1 =
    supported.length === 0
      ? 0
      : supported.reduce((sum, l) => sum + (perClass[l]?.f1 ?? 0), 0) / supported.length;
  return { accuracy: pairs.length === 0 ? 0 : correct / pairs.length, macroF1, perClass };
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] as number;
}
