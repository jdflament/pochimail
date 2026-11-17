import { pipeline } from "@huggingface/transformers";
import { categories, type SyntheticEmail } from "./dataset.ts";
import type { EmbeddingModel } from "./models.ts";
import { classificationReport, percentile, type ClassificationReport } from "./metrics.ts";

export interface EmbeddingResult {
  model: string;
  dim: number;
  loadMs: number;
  emailsPerSecond: number;
  p50LatencyMs: number;
  /** 5-fold nearest-centroid on all languages mixed. */
  mixed: ClassificationReport;
  /** Fit on English only, tested on French + Japanese: shows cross-lingual alignment. */
  crossLingual: ClassificationReport;
}

const textOf = (e: SyntheticEmail): string => `${e.subject}\n${e.from}\n${e.snippet}`;

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  const s = 1 / (Math.sqrt(n) || 1);
  return v.map((x) => x * s);
}

/** Nearest-centroid classifier by cosine similarity: a deliberately simple head so models are compared on the embedding, not on tuning. */
export function nearestCentroid(train: { vector: Float32Array; label: string }[], test: Float32Array[]): string[] {
  const dim = train[0]?.vector.length ?? 0;
  const centroids = new Map<string, Float32Array>();
  for (const { vector, label } of train) {
    const c = centroids.get(label) ?? new Float32Array(dim);
    for (let i = 0; i < dim; i++) c[i] = (c[i] ?? 0) + (vector[i] ?? 0);
    centroids.set(label, c);
  }
  const normalized = [...centroids].map(([label, c]) => [label, normalize(c)] as const);
  return test.map((vector) => {
    let best = "";
    let bestScore = -Infinity;
    for (const [label, c] of normalized) {
      let score = 0;
      for (let i = 0; i < dim; i++) score += (c[i] ?? 0) * (vector[i] ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = label;
      }
    }
    return best;
  });
}

export async function benchEmbedding(model: EmbeddingModel, emails: SyntheticEmail[]): Promise<EmbeddingResult> {
  const loadStart = performance.now();
  const extractor = await pipeline("feature-extraction", model.hubId, { dtype: model.dtype, device: "cpu" });
  const loadMs = performance.now() - loadStart;

  const vectors: Float32Array[] = [];
  const latencies: number[] = [];
  const start = performance.now();
  for (const email of emails) {
    const t = performance.now();
    const out = await extractor(model.prefix + textOf(email), { pooling: model.pooling, normalize: true });
    latencies.push(performance.now() - t);
    vectors.push(Float32Array.from(out.data as Float32Array));
  }
  const seconds = (performance.now() - start) / 1000;

  const folds = 5;
  const mixedPairs: { expected: string; predicted: string }[] = [];
  for (let fold = 0; fold < folds; fold++) {
    const trainIdx = emails.map((_, i) => i).filter((i) => i % folds !== fold);
    const testIdx = emails.map((_, i) => i).filter((i) => i % folds === fold);
    const predicted = nearestCentroid(
      trainIdx.map((i) => ({ vector: vectors[i] as Float32Array, label: (emails[i] as SyntheticEmail).category })),
      testIdx.map((i) => vectors[i] as Float32Array),
    );
    testIdx.forEach((i, k) => mixedPairs.push({ expected: (emails[i] as SyntheticEmail).category, predicted: predicted[k] as string }));
  }

  const enIdx = emails.map((_, i) => i).filter((i) => (emails[i] as SyntheticEmail).language === "en");
  const otherIdx = emails.map((_, i) => i).filter((i) => (emails[i] as SyntheticEmail).language !== "en");
  const crossPredicted = nearestCentroid(
    enIdx.map((i) => ({ vector: vectors[i] as Float32Array, label: (emails[i] as SyntheticEmail).category })),
    otherIdx.map((i) => vectors[i] as Float32Array),
  );
  const crossPairs = otherIdx.map((i, k) => ({ expected: (emails[i] as SyntheticEmail).category, predicted: crossPredicted[k] as string }));

  await extractor.dispose();
  return {
    model: model.id,
    dim: vectors[0]?.length ?? 0,
    loadMs: Math.round(loadMs),
    emailsPerSecond: Number((emails.length / seconds).toFixed(1)),
    p50LatencyMs: Number(percentile(latencies, 50).toFixed(1)),
    mixed: classificationReport(mixedPairs, categories),
    crossLingual: classificationReport(crossPairs, categories),
  };
}
