import { CATEGORIES } from "@pochimail/core/domain/category";
import type { Classifier } from "@pochimail/core/ports/ai";
import { ok } from "@pochimail/core/result";

/**
 * Wraps a classifier and moves every `every`-th answer to the next category. It stands in for a
 * regressed model, to prove the eval gate trips when accuracy drops.
 */
export function degradeClassifier(inner: Classifier, every = 3): Classifier {
  let seen = 0;
  return {
    async classify(messages, signal) {
      const answered = await inner.classify(messages, signal);
      if (!answered.ok) return answered;
      return ok(
        answered.value.map((c) => {
          if (++seen % every !== 0) return c;
          const next = CATEGORIES[(CATEGORIES.indexOf(c.category) + 1) % CATEGORIES.length];
          return next ? { ...c, category: next } : c;
        }),
      );
    },
  };
}
