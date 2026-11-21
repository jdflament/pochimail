// Guards: a protected sender proposed for cleanup, a digest that re-reports old mail, an Overview figure that drifts, and a lost or phantom event.
import { unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";
import { createSuggestion } from "./model/suggestion.ts";
import { digestContract } from "./testing/digest-contract.ts";
import { digestStateContract } from "./testing/digest-state-contract.ts";
import { createInMemoryCleanup } from "./testing/in-memory-cleanup.ts";
import { createInMemoryDigestTally } from "./testing/in-memory-digest-tally.ts";
import { ACCOUNT_1, makeSuggestion, WS_A } from "./testing/samples.ts";
import { suggestionRepositoryContract } from "./testing/suggestion-repository-contract.ts";
import { suggestionsContract } from "./testing/suggestions-contract.ts";
import { GetDigestStatus } from "./use-cases/get-digest-status.ts";
import { GetOverview } from "./use-cases/get-overview.ts";
import { RecordDigestReady } from "./use-cases/record-digest-ready.ts";

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
suggestionsContract(() => ({
  ...createInMemoryCleanup(),
  clock: fakeClock(),
  protectedLabels: ["people"],
}));
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
  const old = (days: number) =>
    new Date(Date.parse("2026-01-01T00:00:00.000Z") - days * 86_400_000).toISOString();
  const overviewOf = async (
    rows: Parameters<ReturnType<typeof createInMemoryCleanup>["seed"]>[0],
  ) => {
    const cleanup = createInMemoryCleanup();
    await cleanup.seed(rows);
    return unwrap(
      await new GetOverview({ uow: cleanup.uow, clock: fakeClock() }).execute(WS_A, ACCOUNT_1),
    );
  };
  const action = (
    overview: Awaited<ReturnType<typeof overviewOf>>,
    kind: string,
    category: string,
  ) => overview.actions.find((a) => a.kind === kind && a.category === category);

  it("counts what needs the person (guards a drifting headline figure)", async () => {
    const overview = await overviewOf({
      1: { category: "newsletters", signals: ["needs-reply"] },
      2: { category: "promotions" },
      3: { category: "promotions", signals: ["time-sensitive"] },
      4: { category: "people" },
    });
    expect(overview.scanned).toBe(4);
    expect([overview.waiting, overview.deadlines, overview.toReview]).toEqual([1, 1, 2]);
  });

  it("never pre-selects a protected email and reports it apart (guards deleting what matters)", async () => {
    const overview = await overviewOf({
      1: { category: "notifications", message: { receivedAt: old(120), size: 100 } },
      2: {
        category: "notifications",
        signals: ["needs-reply"],
        message: { receivedAt: old(120), size: 900 },
      },
      3: { category: "notifications", message: { receivedAt: old(5), size: 50 } },
    });
    expect(action(overview, "delete", "notifications")).toEqual({
      kind: "delete",
      category: "notifications",
      count: 1,
      bytes: 100,
      protectedCount: 1,
      sizeKnown: true,
    });
  });

  it("gives no figure while a size is unverified (guards a made-up GB number)", async () => {
    const overview = await overviewOf({
      1: { category: "promotions", message: { receivedAt: old(120), size: 100 } },
      2: { category: "promotions", message: { receivedAt: old(120), size: null } },
    });
    expect(action(overview, "delete", "promotions")).toMatchObject({
      count: 2,
      bytes: null,
      sizeKnown: false,
    });
    expect(overview.totalBytes).toBeNull();
  });

  it("keeps archive and delete apart, so archiving never changes the freed space (guards double counting)", async () => {
    const overview = await overviewOf({
      1: { category: "notifications", message: { receivedAt: old(40), size: 70 } },
      2: { category: "notifications", message: { receivedAt: old(120), size: 30 } },
    });
    expect(action(overview, "archive", "notifications")).toMatchObject({ count: 1, bytes: 70 });
    expect(action(overview, "delete", "notifications")).toMatchObject({ count: 1, bytes: 30 });
  });

  it("counts unsubscribe by sender and skips senders you open (guards unsubscribing from mail you read)", async () => {
    const overview = await overviewOf({
      1: { category: "newsletters", message: { from: "a@example.com", hasListUnsubscribe: true } },
      2: { category: "newsletters", message: { from: "a@example.com", hasListUnsubscribe: true } },
      3: {
        category: "newsletters",
        message: { from: "b@example.com", hasListUnsubscribe: true, opened: true },
      },
    });
    expect(action(overview, "unsubscribe", "newsletters")?.count).toBe(1);
  });
});

describe("digest status", () => {
  it("counts a delivered event once (guards double counting on at-least-once delivery)", () => {
    const tally = createInMemoryDigestTally();
    const record = new RecordDigestReady({ tally });
    const event = {
      id: "digest:acc-1:since",
      type: "DigestReady" as const,
      version: 1 as const,
      workspaceId: WS_A,
      occurredAt: "2026-01-01T00:00:00.000Z",
      payload: { itemCount: 3 },
    };
    record.execute(event);
    record.execute(event);
    expect(new GetDigestStatus({ tally }).execute()).toEqual({ ready: true, itemCount: 3 });
  });
});
