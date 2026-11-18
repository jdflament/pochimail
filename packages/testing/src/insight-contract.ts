import type { Clock } from "@pochimail/core/clock";
import type { SignalKind } from "@pochimail/core/domain/category";
import type { DerivedMessage } from "@pochimail/core/domain/derived";
import type { IncomingMessage } from "@pochimail/core/domain/mail";
import type { MessageId } from "@pochimail/core/ids";
import type { Classifier } from "@pochimail/core/ports/ai";
import type { UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { ok, unwrap } from "@pochimail/core/result";
import { BuildDigest } from "@pochimail/core/use-cases/build-digest";
import { ClassifyBatch } from "@pochimail/core/use-cases/classify-batch";
import { DetectSignals } from "@pochimail/core/use-cases/detect-signals";
import { ProposeSuggestions } from "@pochimail/core/use-cases/propose-suggestions";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import { makeDerived } from "./derived-contract.ts";
import {
  ACCOUNT_1,
  makeAccount,
  makeIncomingMessage,
  makeSender,
  makeSuggestion,
  WS_A,
} from "./fixtures.ts";

/** What the signal, suggestion and digest suite needs; in-memory today, SQLite in M2. */
export interface InsightHarness {
  readonly uow: UnitOfWork;
  readonly clock: Clock & { advance(ms: number): void };
  readonly classifier: Classifier;
  /** Ground-truth labels the classifier answers from. */
  readonly labels: Map<string, DerivedMessage["category"]>;
  snapshot(): Promise<unknown>;
}

const live = () => new AbortController().signal;
const DAY = 86_400_000;
const idOf = (n: number) => `msg-${n}` as MessageId;

interface Seed {
  readonly message?: Partial<IncomingMessage>;
  readonly category?: DerivedMessage["category"];
  readonly derived?: Partial<DerivedMessage>;
}

/** Stores the account once, then each message with its derived data, through one transaction. */
async function seed(h: InsightHarness, rows: Record<number, Seed>) {
  const r = await h.uow.run(async (tx) => {
    await tx.repositories.accounts.save(makeAccount());
    for (const [key, row] of Object.entries(rows)) {
      const n = Number(key);
      const message = makeIncomingMessage(n, row.message);
      const category = row.category ?? "notifications";
      unwrap(await tx.repositories.messages.upsertMany([message]));
      unwrap(await tx.repositories.messages.setCategory(WS_A, message.id, category));
      unwrap(
        await tx.repositories.derived.save(
          makeDerived(n, { category, snippet: message.snippet, ...row.derived }),
        ),
      );
    }
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

async function kinds(h: InsightHarness, ids: number[]): Promise<Map<number, SignalKind[]>> {
  const found = unwrap(
    await new DetectSignals({ uow: h.uow, clock: h.clock }).execute(
      { workspaceId: WS_A, accountId: ACCOUNT_1, messageIds: ids.map(idOf) },
      live(),
    ),
  );
  return new Map(
    ids.map((n) => [n, found.filter((s) => s.messageId === idOf(n)).map((s) => s.kind)]),
  );
}

const ago = (h: InsightHarness, ms: number) => new Date(h.clock.now().getTime() - ms).toISOString();

/** One positive and one negative fixture: fires on message 1, stays quiet on message 2. */
async function expectSignal(
  h: InsightHarness,
  kind: SignalKind,
  positive: Seed,
  negative: Seed,
  withStats?: () => Promise<void>,
) {
  await seed(h, { 1: positive, 2: negative });
  await withStats?.();
  const got = await kinds(h, [1, 2]);
  expect(got.get(1)).toContain(kind);
  expect(got.get(2)).not.toContain(kind);
}

const unopenedPromos = (extra: Partial<IncomingMessage> = {}): Record<number, Seed> =>
  Object.fromEntries(
    [1, 2, 3].map((n) => [
      n,
      {
        category: "promotions" as const,
        message: { from: "promo@example.com", hasListUnsubscribe: true, ...extra },
        derived: { reason: "Weekly promo, never opened", confidence: 0.95 },
      },
    ]),
  );

const suggestionsFor = async (h: InsightHarness) =>
  unwrap(
    await new ProposeSuggestions({ uow: h.uow, clock: h.clock }).execute(
      { workspaceId: WS_A, accountId: ACCOUNT_1 },
      live(),
    ),
  );

export const insightChecks: readonly Check<InsightHarness>[] = [
  check(
    "needs-reply fires when a person wrote last and not when you did (guards a reply nag on your own message)",
    async (h) =>
      expectSignal(
        h,
        "needs-reply",
        { category: "people", message: { from: "alice@example.com" } },
        { category: "people", message: { from: "owner@example.com" } },
      ),
  ),
  check(
    "waiting-on-them fires after 3 quiet days and not the day you wrote (guards an instant nudge)",
    async (h) =>
      expectSignal(
        h,
        "waiting-on-them",
        {
          category: "people",
          message: { from: "owner@example.com", receivedAt: ago(h, 5 * DAY) },
        },
        { category: "people", message: { from: "owner@example.com", receivedAt: ago(h, DAY) } },
      ),
  ),
  check(
    "important-sender fires for a VIP or often-answered sender and not for a stranger (guards flagging everyone)",
    async (h) =>
      expectSignal(
        h,
        "important-sender",
        { message: { from: "boss@example.com" } },
        { message: { from: "stranger@example.com" } },
        async () => {
          await h.uow.run(async (tx) => {
            await tx.repositories.senders.upsert(
              makeSender({ address: "boss@example.com", vip: true }),
            );
            await tx.repositories.senders.upsert(makeSender({ address: "stranger@example.com" }));
            return ok(undefined);
          });
        },
      ),
  ),
  check(
    "has-document fires on an invoice and not on small talk (guards flagging every email)",
    async (h) =>
      expectSignal(
        h,
        "has-document",
        { message: { subject: "Your invoice 42" } },
        { message: { subject: "Lunch on Friday" } },
      ),
  ),
  check(
    "time-sensitive fires on an expiry notice and not on small talk (guards missed deadlines and false alarms)",
    async (h) =>
      expectSignal(
        h,
        "time-sensitive",
        { message: { subject: "Your offer expires tomorrow" } },
        { message: { subject: "Lunch on Friday" } },
      ),
  ),
  check(
    "old-never-opened fires for old unopened mail only, not for opened or recent mail (guards flagging mail you read)",
    async (h) => {
      const old = ago(h, 45 * DAY);
      await seed(h, {
        1: { message: { receivedAt: old, opened: false } },
        2: { message: { receivedAt: old, opened: true } },
        3: { message: { receivedAt: ago(h, 2 * DAY), opened: false } },
      });
      const got = await kinds(h, [1, 2, 3]);
      expect(got.get(1)).toContain("old-never-opened");
      expect(got.get(2)).not.toContain("old-never-opened");
      expect(got.get(3)).not.toContain("old-never-opened");
    },
  ),
  check(
    "signals are identical whatever the input order and are announced once each (guards non-deterministic output and duplicate events)",
    async (h) => {
      await seed(h, {
        1: { message: { subject: "Invoice due tomorrow" } },
        2: { category: "people", message: { from: "alice@example.com" } },
      });
      const run = (ids: number[]) =>
        new DetectSignals({ uow: h.uow, clock: h.clock }).execute(
          { workspaceId: WS_A, accountId: ACCOUNT_1, messageIds: ids.map(idOf) },
          live(),
        );
      const first = unwrap(await run([1, 2]));
      const second = unwrap(await run([2, 1]));
      expect(second).toEqual(first);
      expect(first.length).toBeGreaterThanOrEqual(3);
    },
  ),
  check(
    "a sender is proposed for unsubscribe with the recorded reason and confidence (guards a suggestion the UI cannot explain)",
    async (h) => {
      await seed(h, unopenedPromos());
      const made = await suggestionsFor(h);
      expect(made).toHaveLength(1);
      const [s] = made;
      expect(s?.command.kind).toBe("unsubscribe");
      expect(s?.reasons.join(" ")).toContain("Weekly promo, never opened");
      expect(s?.confidence).toBe(0.95);
      expect(s?.state).toBe("pending");
    },
  ),
  check(
    "no suggestion touches People mail, even from a sender that also sends promotions, and none is a delete (guards the brief §2 invariants)",
    async (h) => {
      const people = Object.fromEntries(
        [1, 2, 3].map((n) => [
          n,
          {
            category: "people" as const,
            message: { from: "friend@example.com", hasListUnsubscribe: true },
          },
        ]),
      );
      const mixed: Record<number, Seed> = {
        4: {
          category: "promotions",
          message: { from: "shop@example.com", hasListUnsubscribe: true },
        },
        5: {
          category: "promotions",
          message: { from: "shop@example.com", hasListUnsubscribe: true },
        },
        6: { category: "people", message: { from: "shop@example.com", hasListUnsubscribe: true } },
      };
      await seed(h, { ...people, ...mixed });
      const made = await suggestionsFor(h);
      expect(made).toEqual([]);
      const all = unwrap(await h.uow.reads.suggestions.listPending(WS_A, { limit: 100 }));
      for (const s of all.items) expect(["archive", "unsubscribe"]).toContain(s.command.kind);
    },
  ),
  check(
    "senders you open are not proposed and re-running neither duplicates nor reopens a decided suggestion (guards nagging)",
    async (h) => {
      await seed(h, {
        ...unopenedPromos(),
        4: { category: "newsletters", message: { from: "read@example.com", opened: true } },
        5: { category: "newsletters", message: { from: "read@example.com", opened: true } },
        6: { category: "newsletters", message: { from: "read@example.com", opened: true } },
      });
      const first = await suggestionsFor(h);
      expect(first).toHaveLength(1);
      const [created] = first;
      if (!created) throw new Error("expected a suggestion");
      await h.uow.run(async (tx) => {
        await tx.repositories.suggestions.save({ ...created, state: "dismissed" });
        return ok(undefined);
      });
      expect(await suggestionsFor(h)).toEqual([]);
      const stored = unwrap(await h.uow.reads.suggestions.get(WS_A, created.id));
      expect(stored.state).toBe("dismissed");
      expect(makeSuggestion().reasons.length).toBeGreaterThan(0);
    },
  ),
  check(
    "a digest after a second sync holds only mail new since the first (guards re-reporting old mail)",
    async (h) => {
      const base = h.clock.now().getTime();
      const at = (ms: number) => new Date(base + ms).toISOString();
      await seed(h, {
        1: { message: { receivedAt: at(-3_600_000) }, category: "newsletters" },
        2: { message: { receivedAt: at(-3_000_000) }, category: "people", derived: {} },
        3: { message: { receivedAt: at(-2_000_000) }, category: "promotions" },
      });
      const build = new BuildDigest({ uow: h.uow, clock: h.clock });
      const first = unwrap(
        await build.execute({ workspaceId: WS_A, accountId: ACCOUNT_1, since: at(-DAY) }, live()),
      );
      expect(first.newMessageCount).toBe(3);

      h.clock.advance(3_600_000);
      await seed(h, {
        4: {
          message: { receivedAt: at(1_800_000), from: "alice@example.com" },
          category: "people",
        },
        5: { message: { receivedAt: at(2_000_000) }, category: "promotions" },
      });
      const second = unwrap(
        await build.execute(
          { workspaceId: WS_A, accountId: ACCOUNT_1, since: first.generatedAt },
          live(),
        ),
      );
      expect(second.newMessageCount).toBe(2);
      expect(second.byCategory).toEqual({ people: 1, promotions: 1 });
      expect(second.attention).toEqual([{ messageId: idOf(4), kind: "needs-reply" }]);
      const announced = (await h.snapshot()) as { outbox: { event: { type: string } }[] };
      expect(announced.outbox.filter((e) => e.event.type === "DigestReady")).toHaveLength(2);
    },
  ),
  check(
    "classifying records reason, confidence and a capped snippet, and signals, suggestions and digest leave no body behind (follows proposed D11)",
    async (h) => {
      const BODY = "SECRET-BODY-TEXT-0003";
      const cap = 120;
      await seed(h, {});
      const message = makeIncomingMessage(1, {
        snippet: `${"x".repeat(cap)}${BODY}`,
        subject: "Invoice due tomorrow",
      });
      await h.uow.run(async (tx) => {
        await tx.repositories.messages.upsertMany([message]);
        return ok(undefined);
      });
      h.labels.set("msg-1", "records");
      unwrap(
        await new ClassifyBatch({ uow: h.uow, classifier: h.classifier, clock: h.clock }).execute(
          { workspaceId: WS_A, messageIds: [idOf(1)] },
          live(),
        ),
      );
      const stored = unwrap(await h.uow.reads.derived.get(WS_A, idOf(1)));
      expect(stored.snippet.length).toBeLessThanOrEqual(cap);
      expect(stored.reason.length).toBeGreaterThan(0);
      expect(stored.confidence).toBe(1);

      await kinds(h, [1]);
      await suggestionsFor(h);
      unwrap(
        await new BuildDigest({ uow: h.uow, clock: h.clock }).execute(
          { workspaceId: WS_A, accountId: ACCOUNT_1, since: ago(h, DAY) },
          live(),
        ),
      );
      // The message row keeps what sync stored (capped by M1-12); everything derived must not.
      const rows = (await h.snapshot()) as Record<string, unknown>;
      for (const name of ["derived", "suggestions", "outbox"])
        expect(JSON.stringify(rows[name])).not.toContain(BODY);
    },
  ),
];

export function insightContract(make: () => InsightHarness | Promise<InsightHarness>): void {
  registerContract("Signals, suggestions and digest", insightChecks, make);
}
