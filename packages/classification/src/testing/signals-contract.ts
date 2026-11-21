import type { Clock } from "@pochimail/kernel/clock";
import type { MessageId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { expect } from "vitest";
import type { Category, SignalKind } from "../model/category.ts";
import type { Classifier } from "../ports/classifier.ts";
import type { ClassificationUnitOfWork } from "../ports/unit-of-work.ts";
import { ClassifyBatch } from "../use-cases/classify-batch.ts";
import { DetectSignals } from "../use-cases/detect-signals.ts";
import { ACCOUNT_1, live, type Seeder, type SeedRow, WS_A } from "./samples.ts";

/** What the signal and classification suite needs; in-memory here, SQLite in the db package. */
export interface SignalsHarness extends Seeder {
  readonly uow: ClassificationUnitOfWork;
  readonly clock: Clock & { advance(ms: number): void };
  readonly classifier: Classifier;
  /** Ground-truth labels the classifier answers from. */
  readonly labels: Map<string, Category>;
  snapshot(): Promise<unknown>;
}

const DAY = 86_400_000;
const idOf = (n: number) => `msg-${n}` as MessageId;

async function kinds(h: SignalsHarness, ids: number[]): Promise<Map<number, SignalKind[]>> {
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

const ago = (h: SignalsHarness, ms: number) => new Date(h.clock.now().getTime() - ms).toISOString();

/** One positive and one negative fixture: fires on message 1, stays quiet on message 2. */
async function expectSignal(
  h: SignalsHarness,
  kind: SignalKind,
  positive: SeedRow,
  negative: SeedRow,
  withStats?: () => Promise<void>,
) {
  await h.seed({ 1: positive, 2: negative });
  await withStats?.();
  const got = await kinds(h, [1, 2]);
  expect(got.get(1)).toContain(kind);
  expect(got.get(2)).not.toContain(kind);
}

export const signalsChecks: readonly Check<SignalsHarness>[] = [
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
          await h.setSender("boss@example.com", { vip: true });
          await h.setSender("stranger@example.com", {});
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
      await h.seed({
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
      await h.seed({
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
    "signals survive a fresh DetectSignals read without re-detecting, and re-running detection yields identical rows (guards lost or churning signals)",
    async (h) => {
      await h.seed({
        1: { category: "people" },
        2: { message: { subject: "Invoice due tomorrow" } },
      });
      const request = { workspaceId: WS_A, accountId: ACCOUNT_1, messageIds: [idOf(1), idOf(2)] };
      const first = unwrap(
        await new DetectSignals({ uow: h.uow, clock: h.clock }).execute(request, live()),
      );
      expect(first.length).toBeGreaterThan(0);
      const rowsAfterFirst = JSON.stringify(
        ((await h.snapshot()) as Record<string, unknown>).signals,
      );

      h.clock.advance(DAY);
      const fresh = new DetectSignals({ uow: h.uow, clock: h.clock });
      expect(unwrap(await h.uow.reads.signals.listForMessages(WS_A, request.messageIds))).toEqual(
        first,
      );

      unwrap(await fresh.execute(request, live()));
      expect(JSON.stringify(((await h.snapshot()) as Record<string, unknown>).signals)).toBe(
        rowsAfterFirst,
      );
    },
  ),
  check(
    "classifying records reason, confidence and a capped snippet, and signals leave no body behind (follows proposed D11)",
    async (h) => {
      const BODY = "SECRET-BODY-TEXT-0003";
      const cap = 120;
      await h.seed({
        1: {
          message: { snippet: `${"x".repeat(cap)}${BODY}`, subject: "Invoice due tomorrow" },
          derived: { snippet: "placeholder" },
        },
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
      // The message row keeps what sync stored; everything derived must not.
      const rows = (await h.snapshot()) as Record<string, unknown>;
      for (const name of ["derived", "signals", "outbox"])
        expect(JSON.stringify(rows[name])).not.toContain(BODY);
    },
  ),
];

export function signalsContract(make: () => SignalsHarness | Promise<SignalsHarness>): void {
  registerContract("Signals and classification", signalsChecks, make);
}
