import { ok, unwrap } from "@pochimail/kernel/result";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { expect } from "vitest";
import type { CleanupUnitOfWork } from "../ports/unit-of-work.ts";
import { makeSuggestion, WS_A } from "./samples.ts";

/** What a suggestion-repository contract needs: any `CleanupUnitOfWork`. */
export interface SuggestionHarness {
  readonly uow: CleanupUnitOfWork;
}

export const suggestionRepositoryChecks: readonly Check<SuggestionHarness>[] = [
  check(
    "a suggestion round-trips with every field (guards a repository dropping a field)",
    async (h) => {
      const suggestion = makeSuggestion();
      await h.uow.run(async (tx) => tx.repositories.suggestions.save(suggestion));
      expect(await h.uow.reads.suggestions.get(WS_A, suggestion.id)).toEqual(ok(suggestion));
    },
  ),
  check(
    "listPending leaves out approved and dismissed suggestions (guards re-proposing decided items)",
    async (h) => {
      const other = (id: string, state: "approved" | "dismissed") =>
        makeSuggestion({ id: id as never, state });
      await h.uow.run(async (tx) => {
        await tx.repositories.suggestions.save(makeSuggestion());
        await tx.repositories.suggestions.save(other("sug-2", "approved"));
        await tx.repositories.suggestions.save(other("sug-3", "dismissed"));
        return ok(undefined);
      });
      const page = unwrap(await h.uow.reads.suggestions.listPending(WS_A, { limit: 10 }));
      expect(page.items.map((s) => s.id)).toEqual(["sug-1"]);
    },
  ),
];

export function suggestionRepositoryContract(
  make: () => SuggestionHarness | Promise<SuggestionHarness>,
): void {
  registerContract("Suggestion repository", suggestionRepositoryChecks, make);
}
