import type { DerivedMessage } from "@pochimail/core/domain/derived";
import type { MessageId } from "@pochimail/core/ids";
import { ok, unwrap } from "@pochimail/core/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import { ACCOUNT_1, WS_A, WS_B } from "./fixtures.ts";
import type { UnitOfWorkHarness } from "./unit-of-work-contract.ts";

export const makeDerived = (n: number, over: Partial<DerivedMessage> = {}): DerivedMessage => ({
  schemaVersion: 1,
  workspaceId: WS_A,
  accountId: ACCOUNT_1,
  messageId: `msg-${n}` as MessageId,
  category: "newsletters",
  reason: "Weekly newsletter, never opened",
  confidence: 0.9,
  modelVersion: "rules-1",
  snippet: `Snippet ${n}`,
  derivedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

async function save(h: UnitOfWorkHarness, ...rows: DerivedMessage[]) {
  const r = await h.uow.run(async (tx) => {
    for (const row of rows) unwrap(await tx.repositories.derived.save(row));
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

export const derivedChecks: readonly Check<UnitOfWorkHarness>[] = [
  check(
    "a decision keeps its reason, confidence, version and template hash across a round trip (guards a UI that cannot explain a decision)",
    async (h) => {
      const row = makeDerived(1, { templateHash: "tpl-1", embeddingRef: "emb-1" });
      await save(h, row);
      expect(await h.uow.reads.derived.get(WS_A, row.messageId)).toEqual(ok(row));
    },
  ),
  check(
    "saving again replaces the row and never returns another workspace's data (guards duplicates on re-classification and cross-workspace leaks)",
    async (h) => {
      await save(h, makeDerived(1), makeDerived(1, { category: "promotions", confidence: 0.5 }));
      const got = unwrap(await h.uow.reads.derived.get(WS_A, "msg-1" as MessageId));
      expect([got.category, got.confidence]).toEqual(["promotions", 0.5]);
      const listed = unwrap(await h.uow.reads.derived.list(WS_A, ACCOUNT_1, { limit: 10 }));
      expect(listed.items).toHaveLength(1);
      expect((await h.uow.reads.derived.get(WS_B, "msg-1" as MessageId)).ok).toBe(false);
      expect(unwrap(await h.uow.reads.derived.list(WS_B, ACCOUNT_1, { limit: 10 })).items).toEqual(
        [],
      );
    },
  ),
];

export function derivedContract(make: () => UnitOfWorkHarness | Promise<UnitOfWorkHarness>): void {
  registerContract("Derived message data", derivedChecks, make);
}
