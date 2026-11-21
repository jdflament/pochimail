import { unwrap } from "@pochimail/kernel/result";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { expect } from "vitest";
import { CATEGORIES } from "../model/category.ts";
import type { Classifier, Embedder, LlmProvider } from "../ports/classifier.ts";
import { aborted, live, makeMessage } from "./samples.ts";

const cancelled = (r: { ok: boolean; error?: { code: string } }) => {
  expect(r.ok).toBe(false);
  expect(r.error?.code).toBe("operation.cancelled");
};

export const classifierChecks: readonly Check<Classifier>[] = [
  check(
    "returns one valid classification per message, in order (guards misaligned or invalid results)",
    async (c) => {
      const messages = [makeMessage(1), makeMessage(2, { hasListUnsubscribe: true })];
      const out = unwrap(await c.classify(messages, live()));
      expect(out.map((x) => x.messageId)).toEqual(messages.map((m) => m.id));
      for (const x of out) {
        expect(CATEGORIES).toContain(x.category);
        expect(x.confidence).toBeGreaterThanOrEqual(0);
        expect(x.confidence).toBeLessThanOrEqual(1);
        expect(x.reasons.length).toBeGreaterThan(0);
      }
    },
  ),
  check("an empty batch is an empty result (guards an error on nothing to do)", async (c) => {
    expect(unwrap(await c.classify([], live()))).toEqual([]);
  }),
  check(
    "an aborted signal is Cancelled (guards classification continuing after cancel)",
    async (c) => {
      cancelled(await c.classify([makeMessage(1)], aborted()));
    },
  ),
];

export const embedderChecks: readonly Check<Embedder>[] = [
  check(
    "returns one vector of `dimensions` per text (guards vectors the index cannot store)",
    async (e) => {
      const out = unwrap(await e.embed(["a", "bb", "ccc"], live()));
      expect(out).toHaveLength(3);
      for (const v of out) expect(v.length).toBe(e.dimensions);
    },
  ),
  check("the same text gives the same vector (guards duplicate-detection drift)", async (e) => {
    const [a, b] = unwrap(await e.embed(["weekly update", "weekly update"], live()));
    expect(Array.from(a ?? [])).toEqual(Array.from(b ?? []));
  }),
  check(
    "different texts give different vectors (guards a constant embedder hiding similarity bugs)",
    async (e) => {
      const [a, b] = unwrap(await e.embed(["invoice for January", "holiday photos"], live()));
      expect(Array.from(a ?? [])).not.toEqual(Array.from(b ?? []));
    },
  ),
  check("an aborted signal is Cancelled (guards embedding continuing after cancel)", async (e) => {
    cancelled(await e.embed(["x"], aborted()));
  }),
];

export const llmProviderChecks: readonly Check<LlmProvider>[] = [
  check("complete returns text (guards an empty or non-string answer)", async (llm) => {
    const text = unwrap(await llm.complete({ prompt: "Say hi", maxTokens: 8 }, live()));
    expect(typeof text).toBe("string");
  }),
  check(
    "an aborted signal is Cancelled (guards generation continuing after cancel)",
    async (llm) => {
      cancelled(await llm.complete({ prompt: "x" }, aborted()));
    },
  ),
];

export const classifierContract = (make: () => Classifier | Promise<Classifier>) =>
  registerContract("Classifier contract", classifierChecks, make);
export const embedderContract = (make: () => Embedder | Promise<Embedder>) =>
  registerContract("Embedder contract", embedderChecks, make);
export const llmProviderContract = (make: () => LlmProvider | Promise<LlmProvider>) =>
  registerContract("LlmProvider contract", llmProviderChecks, make);
