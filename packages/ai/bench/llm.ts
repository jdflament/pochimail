import {
  getLlama,
  type Llama,
  LlamaChatSession,
  type LlamaGrammar,
  resolveModelFile,
} from "node-llama-cpp";
import { z } from "zod";
import {
  type Category,
  categories,
  type Language,
  languages,
  type SyntheticEmail,
} from "./dataset.ts";
import { type ClassificationReport, classificationReport, percentile } from "./metrics.ts";
import type { GenerativeModel } from "./models.ts";

export interface LlmResult {
  model: string;
  backend: string;
  loadMs: number;
  /** Decode speed on a free-text generation (tokens/s) and prompt-processing speed (tokens/s). */
  decodeTokensPerSecond: number;
  promptTokensPerSecond: number;
  classification: ClassificationReport & {
    emailsPerMinute: number;
    p50LatencyMs: number;
    jsonParseRate: number;
    byLanguage: Record<Language, number>;
  };
  extraction: {
    exactDateRate: number;
    nullCorrectRate: number;
    emailsPerMinute: number;
    jsonParseRate: number;
  };
}

const classifyOut = z.object({ category: z.enum(categories) });
const extractOut = z.object({ deadline: z.string().nullable() });

const classifySchema = {
  type: "object",
  properties: { category: { enum: [...categories] } },
  required: ["category"],
} as const;
const extractSchema = {
  type: "object",
  properties: { deadline: { type: ["string", "null"] } },
  required: ["deadline"],
} as const;

const classifySystem = `You sort one email into exactly one category. Emails may be in English, French or Japanese.
Categories: people (real personal or work conversation), records (bank, tax, insurance, health, contracts), purchases-travel (orders, receipts, shipping, bookings, tickets), sign-ins-security (login codes, password resets, new-device alerts), notifications (apps, social, calendar, comments), newsletters (subscribed editorial content), promotions (sales, marketing offers).
Answer with JSON only.`;
const extractSystem = `You read one email (English, French or Japanese) and extract its deadline: the date by which the reader must act, or on which an offer, delivery or check-in falls. Dates have no year: use 2027. Answer {"deadline":"YYYY-MM-DD"} or {"deadline":null} when the email states no date. Answer with JSON only.`;

const emailPrompt = (e: SyntheticEmail): string =>
  `From: ${e.from}\nSubject: ${e.subject}\n\n${e.snippet}`;

export interface LlmOptions {
  modelsDir: string;
  /** Force CPU-only inference (stands in for a machine without a usable GPU, tier T0/T1 fallback). */
  cpuOnly: boolean;
}

export async function benchGenerative(
  model: GenerativeModel,
  emails: SyntheticEmail[],
  options: LlmOptions,
): Promise<LlmResult> {
  const llama: Llama = await getLlama(options.cpuOnly ? { gpu: false } : {});
  const loadStart = performance.now();
  const modelPath = await resolveModelFile(model.uri, options.modelsDir);
  const loaded = await llama.loadModel({ modelPath });
  const context = await loaded.createContext({ contextSize: 2048 });
  const loadMs = performance.now() - loadStart;
  const sequence = context.getSequence();
  const subset = emails;

  const classifyGrammar = await llama.createGrammarForJsonSchema(classifySchema);
  const extractGrammar = await llama.createGrammarForJsonSchema(extractSchema);
  const run = async (
    system: string,
    grammar: LlamaGrammar,
    email: SyntheticEmail,
  ): Promise<{ text: string; ms: number }> => {
    const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system });
    const t = performance.now();
    const text = await session.prompt(emailPrompt(email), {
      grammar,
      temperature: 0,
      maxTokens: 64,
      budgets: { thoughtTokens: 0 },
    });
    const ms = performance.now() - t;
    session.dispose({ disposeSequence: false });
    return { text, ms };
  };

  // Free-text speed probe: time to first token approximates prompt processing, the rest is decode.
  const probe = new LlamaChatSession({ contextSequence: sequence });
  const probePrompt = `${"Summarize the following email in detail. ".repeat(1)}${emailPrompt(subset[0] as SyntheticEmail)}`;
  const promptTokens = loaded.tokenize(probePrompt).length;
  let first = 0;
  let produced = 0;
  const t0 = performance.now();
  await probe.prompt(probePrompt, {
    maxTokens: 128,
    temperature: 0,
    budgets: { thoughtTokens: 0 },
    onToken: () => {
      if (produced === 0) first = performance.now();
      produced++;
    },
  });
  const t1 = performance.now();
  probe.dispose({ disposeSequence: false });
  const decodeTokensPerSecond = produced > 1 ? (produced - 1) / ((t1 - first) / 1000) : 0;
  const promptTokensPerSecond = first > t0 ? promptTokens / ((first - t0) / 1000) : 0;

  const pairs: { expected: string; predicted: string }[] = [];
  const latencies: number[] = [];
  let parsed = 0;
  const cStart = performance.now();
  const hits: Record<Language, { ok: number; n: number }> = {
    en: { ok: 0, n: 0 },
    fr: { ok: 0, n: 0 },
    ja: { ok: 0, n: 0 },
  };
  for (const email of subset) {
    const { text, ms } = await run(classifySystem, classifyGrammar, email);
    latencies.push(ms);
    const result = classifyOut.safeParse(safeJson(text));
    if (result.success) parsed++;
    const predicted: Category | "invalid" = result.success ? result.data.category : "invalid";
    pairs.push({ expected: email.category, predicted });
    hits[email.language].n++;
    if (predicted === email.category) hits[email.language].ok++;
  }
  const cMinutes = (performance.now() - cStart) / 60000;

  let exact = 0;
  let nullOk = 0;
  let nullTotal = 0;
  let withDate = 0;
  let parsedX = 0;
  const xStart = performance.now();
  for (const email of subset) {
    const { text } = await run(extractSystem, extractGrammar, email);
    const result = extractOut.safeParse(safeJson(text));
    if (result.success) parsedX++;
    const got = result.success ? result.data.deadline : "invalid";
    if (email.deadline === null) {
      nullTotal++;
      if (got === null) nullOk++;
    } else {
      withDate++;
      if (got === email.deadline) exact++;
    }
  }
  const xMinutes = (performance.now() - xStart) / 60000;

  const backend = llama.gpu === false ? "cpu" : String(llama.gpu);
  await context.dispose();
  await loaded.dispose();
  await llama.dispose();
  const byLanguage = Object.fromEntries(
    languages.map((l) => [l, round(hits[l].n ? hits[l].ok / hits[l].n : 0)]),
  ) as Record<Language, number>;
  return {
    model: model.id,
    backend,
    loadMs: Math.round(loadMs),
    decodeTokensPerSecond: Number(decodeTokensPerSecond.toFixed(1)),
    promptTokensPerSecond: Number(promptTokensPerSecond.toFixed(1)),
    classification: {
      ...classificationReport(pairs, categories),
      emailsPerMinute: Number((subset.length / cMinutes).toFixed(1)),
      p50LatencyMs: Number(percentile(latencies, 50).toFixed(0)),
      jsonParseRate: round(parsed / subset.length),
      byLanguage,
    },
    extraction: {
      exactDateRate: round(withDate ? exact / withDate : 0),
      nullCorrectRate: round(nullTotal ? nullOk / nullTotal : 0),
      emailsPerMinute: Number((subset.length / xMinutes).toFixed(1)),
      jsonParseRate: round(parsedX / subset.length),
    },
  };
}

const round = (n: number): number => Number(n.toFixed(3));

// node-llama-cpp 3.22.3 + thoughtTokens:0 on Qwen3.5 returns the grammar-constrained object without its opening "{"
// (the brace is consumed with the empty thought segment), so restore it before parsing. Recorded in ADR 0006.
function safeJson(text: string): unknown {
  const trimmed = text.trimStart();
  try {
    return JSON.parse(trimmed.startsWith("{") ? trimmed : `{${trimmed}`);
  } catch {
    return undefined;
  }
}
