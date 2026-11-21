// Guards: a protected sender proposed for cleanup, a digest that re-reports old mail, an Overview figure that drifts, and a lost or phantom event.
import { unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";
import { createSuggestion } from "./model/suggestion.ts";
import { digestContract } from "./testing/digest-contract.ts";
import { digestStateContract } from "./testing/digest-state-contract.ts";
import { createInMemoryCleanup } from "./testing/in-memory-cleanup.ts";
import { ACCOUNT_1, makeSuggestion, WS_A } from "./testing/samples.ts";
import { suggestionRepositoryContract } from "./testing/suggestion-repository-contract.ts";
import { suggestionsContract } from "./testing/suggestions-contract.ts";
import { GetOverview } from "./use-cases/get-overview.ts";
import { LatestDigest } from "./use-cases/latest-digest.ts";

const fakeClock = () => {
  let at = Date.parse("2026-01-01T00:00:00.000Z");
  return {
    now: () => new Date(at),
    advance: (ms: number) => {
      at += ms;
    },
  };
};

digestStateContract(() => createInMemoryCleanup());
suggestionRepositoryContract(() => createInMemoryCleanup());
suggestionsContract(() => ({ ...createInMemoryCleanup(), clock: fakeClock() }));
digestContract(() => ({ ...createInMemoryCleanup(), clock: fakeClock() }));

describe("Suggestion invariants", () => {
  it("rejects a suggestion without reasons (UI could not explain it)", () => {
    expect(createSuggestion({ ...makeSuggestion(), reasons: [] }).ok).toBe(false);
  });
  it.each([-0.01, 1.01, Number.NaN])(
    "rejects confidence %s outside 0..1 (autopilot threshold bypass)",
    (confidence) => {
      expect(createSuggestion({ ...makeSuggestion(), confidence }).ok).toBe(false);
    },
  );
  it("accepts a valid suggestion", () => {
    expect(createSuggestion(makeSuggestion()).ok).toBe(true);
  });
});

describe("GetOverview", () => {
  it("counts what needs the person and what could be cleaned, largest first (guards a drifting headline figure)", async () => {
    const cleanup = createInMemoryCleanup();
    await cleanup.seed({
      1: { category: "newsletters", signals: ["needs-reply"] },
      2: { category: "promotions" },
      3: { category: "promotions", signals: ["time-sensitive"] },
      4: { category: "people" },
    });
    const overview = unwrap(
      await new GetOverview({ uow: cleanup.uow, clock: fakeClock() }).execute(WS_A, ACCOUNT_1),
    );
    expect(overview.scanned).toBe(4);
    expect([overview.waiting, overview.deadlines, overview.toReview]).toEqual([1, 1, 2]);
    expect(overview.cleanable).toEqual([
      { category: "promotions", count: 2 },
      { category: "newsletters", count: 1 },
    ]);
  });
});

describe("LatestDigest", () => {
  it("counts a delivered event once (guards double counting on at-least-once delivery)", () => {
    const latest = new LatestDigest();
    const event = {
      id: "digest:acc-1:since",
      type: "DigestReady" as const,
      version: 1 as const,
      workspaceId: WS_A,
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { itemCount: 3 },
    };
    latest.handle(event);
    latest.handle(event);
    expect(latest.get()).toEqual({ ready: true, itemCount: 3 });
  });
});
