import { createFakeEmbedder, createFakeLlmProvider } from "@pochimail/testing/fake-ai";
import { generateMailbox } from "@pochimail/testing/fixture-mailbox/generator";
import { createGroundTruthClassifier } from "@pochimail/testing/ground-truth-classifier";
import { DEMO_SEED, type DemoScale } from "../shared/demo.ts";
import type { ModelHostEngine } from "./serve.ts";

/** The fixture's ground-truth labels as the "model": same dataset in the worker and the host, no real model (M3). */
export const createFixtureEngine = (scale: DemoScale): ModelHostEngine => {
  const mailbox = generateMailbox({ seed: DEMO_SEED, scale });
  const labels = new Map(mailbox.labels.messages.map((l) => [l.messageId, l.category] as const));
  return {
    classifier: createGroundTruthClassifier(labels),
    llm: createFakeLlmProvider(),
    embedder: createFakeEmbedder(),
  };
};
