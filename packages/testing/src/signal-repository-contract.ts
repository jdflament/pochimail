import type { StoredSignal } from "@pochimail/core/domain/mail";
import type { MessageId } from "@pochimail/core/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import { WS_A, WS_B } from "./fixtures.ts";
import type { UnitOfWorkHarness } from "./unit-of-work-contract.ts";

export const makeSignal = (n: number, over: Partial<StoredSignal> = {}): StoredSignal => ({
  schemaVersion: 1,
  workspaceId: WS_A,
  messageId: `msg-${n}` as MessageId,
  kind: "needs-reply",
  confidence: 0.8,
  detectedAt: "2026-01-01T00:00:00.000Z",
  reason: "A person wrote last and you have not answered",
  ...over,
});

const ids = (...ns: number[]) => ns.map((n) => `msg-${n}` as MessageId);

async function replace(h: UnitOfWorkHarness, scope: number[], ...rows: StoredSignal[]) {
  const r = await h.uow.run(async (tx) => {
    unwrap(await tx.repositories.signals.replaceForMessages(WS_A, ids(...scope), rows));
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

export const signalRepositoryChecks: readonly Check<UnitOfWorkHarness>[] = [
  check(
    "signals round-trip sorted by message then kind, and saving twice leaves one row per message and kind (guards duplicate signal rows on re-detection)",
    async (h) => {
      const rows = [
        makeSignal(2),
        makeSignal(1, { kind: "time-sensitive" }),
        makeSignal(1, { kind: "has-document" }),
      ];
      await replace(h, [1, 2], ...rows);
      await replace(h, [1, 2], ...rows);
      const got = unwrap(await h.uow.reads.signals.listForMessages(WS_A, ids(2, 1)));
      expect(got.map((s) => `${s.messageId}:${s.kind}`)).toEqual([
        "msg-1:has-document",
        "msg-1:time-sensitive",
        "msg-2:needs-reply",
      ]);
      expect(got[0]).toEqual(makeSignal(1, { kind: "has-document" }));
    },
  ),
  check(
    "replacing drops a signal that no longer applies and leaves other messages and workspaces alone (guards stale signals and cross-workspace leaks)",
    async (h) => {
      await replace(h, [1, 2], makeSignal(1), makeSignal(2));
      await replace(h, [1], makeSignal(1, { kind: "has-document" }));
      const got = unwrap(await h.uow.reads.signals.listForMessages(WS_A, ids(1, 2)));
      expect(got.map((s) => `${s.messageId}:${s.kind}`)).toEqual([
        "msg-1:has-document",
        "msg-2:needs-reply",
      ]);
      expect(unwrap(await h.uow.reads.signals.listForMessages(WS_B, ids(1, 2)))).toEqual([]);
    },
  ),
];

export function signalRepositoryContract(
  make: () => UnitOfWorkHarness | Promise<UnitOfWorkHarness>,
): void {
  registerContract("Signal repository", signalRepositoryChecks, make);
}
