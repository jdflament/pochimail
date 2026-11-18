import type { AccountId } from "@pochimail/core/ids";
import { ok, unwrap } from "@pochimail/core/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import { ACCOUNT_1, WS_A, WS_B } from "./fixtures.ts";
import type { UnitOfWorkHarness } from "./unit-of-work-contract.ts";

const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

async function set(h: UnitOfWorkHarness, account: AccountId, at: string) {
  const r = await h.uow.run(async (tx) => {
    unwrap(await tx.repositories.digestState.set(WS_A, account, at));
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

export const digestStateChecks: readonly Check<UnitOfWorkHarness>[] = [
  check(
    "no state before the first digest, then the last one replaces the previous (guards a digest that restarts from the beginning)",
    async (h) => {
      expect(unwrap(await h.uow.reads.digestState.get(WS_A, ACCOUNT_1))).toBeNull();
      await set(h, ACCOUNT_1, AT);
      await set(h, ACCOUNT_1, LATER);
      expect(unwrap(await h.uow.reads.digestState.get(WS_A, ACCOUNT_1))).toBe(LATER);
    },
  ),
  check(
    "state is kept per account and workspace (guards one account's digest hiding another's mail)",
    async (h) => {
      await set(h, ACCOUNT_1, AT);
      expect(unwrap(await h.uow.reads.digestState.get(WS_A, "acc-2" as AccountId))).toBeNull();
      expect(unwrap(await h.uow.reads.digestState.get(WS_B, ACCOUNT_1))).toBeNull();
    },
  ),
  check(
    "setting the date alone keeps the sequence the last digest covered (guards a caller re-reporting the whole account)",
    async (h) => {
      const r = await h.uow.run(async (tx) => {
        unwrap(await tx.repositories.digestState.set(WS_A, ACCOUNT_1, AT, 42));
        unwrap(await tx.repositories.digestState.set(WS_A, ACCOUNT_1, LATER));
        return ok(undefined);
      });
      expect(r.ok).toBe(true);
      expect(unwrap(await h.uow.reads.digestState.getSequence(WS_A, ACCOUNT_1))).toBe(42);
      expect(unwrap(await h.uow.reads.digestState.get(WS_A, ACCOUNT_1))).toBe(LATER);
    },
  ),
];

export function digestStateContract(
  make: () => UnitOfWorkHarness | Promise<UnitOfWorkHarness>,
): void {
  registerContract("Digest state", digestStateChecks, make);
}
