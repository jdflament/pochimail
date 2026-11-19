import type { Category } from "@pochimail/core/domain/category";
import { AiUnavailable } from "@pochimail/core/errors";
import type { AiError, Classification, Classifier } from "@pochimail/core/ports/ai";
import { Cancelled } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "@pochimail/kernel/testing/faults";

export interface GroundTruthClassifier extends Classifier {
  readonly faults: Faults<AiError>;
  /** Shorthand for `faults.failWith(new AiUnavailable())`. */
  makeUnavailable(): void;
}

/**
 * Stub classifier for M1: answers with the fixture mailbox's ground-truth label of each message
 * (confidence 1). A message without a label gets no answer. The real classifier arrives in M3.
 */
export function createGroundTruthClassifier(
  labels: ReadonlyMap<string, Category>,
): GroundTruthClassifier {
  const faults = createFaults<AiError>();
  return {
    faults,
    makeUnavailable: () => faults.failWith(new AiUnavailable()),
    async classify(messages, signal) {
      if (signal.aborted) return err(new Cancelled());
      const failure = faults.take();
      if (failure) return err(failure);
      return ok(
        messages.flatMap((m): Classification[] => {
          const category = labels.get(m.id);
          return category === undefined
            ? []
            : [{ messageId: m.id, category, confidence: 1, reasons: ["ground-truth label"] }];
        }),
      );
    },
  };
}
