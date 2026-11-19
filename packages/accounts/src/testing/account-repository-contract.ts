import type { WorkspaceId } from "@pochimail/kernel/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";
import type { Account } from "../model/account.ts";
import type { AccountsUnitOfWork } from "../ports/unit-of-work.ts";

/** A valid account for contract and use-case tests; no real address. */
export const makeAccount = (over: Partial<Account> = {}): Account => ({
  schemaVersion: 1,
  id: "acc-1" as Account["id"],
  workspaceId: "ws-a" as WorkspaceId,
  provider: "gmail",
  address: "owner@example.com",
  connectedAt: "2026-01-01T00:00:00.000Z",
  grantedScopes: [],
  ...over,
});

/** Contract of the account repository behind any `AccountsUnitOfWork`; SQLite runs it unchanged. */
export function accountRepositoryContract(make: () => { uow: AccountsUnitOfWork }): void {
  const save = async (uow: AccountsUnitOfWork, a: Account) => {
    const r = await uow.run(async (tx) => tx.repositories.accounts.save(a));
    expect(r.ok).toBe(true);
  };
  describe("Account repository contract", () => {
    it("never returns another workspace's account (guards cross-workspace leaks)", async () => {
      const { uow } = make();
      await save(uow, makeAccount());
      const other = "ws-b" as WorkspaceId;
      expect(await uow.reads.accounts.list(other)).toEqual(ok([]));
      const found = await uow.reads.accounts.get(other, makeAccount().id);
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("storage.not_found");
    });
    it("save replaces the row with the same id (guards duplicate rows after an update)", async () => {
      const { uow } = make();
      await save(uow, makeAccount());
      await save(uow, makeAccount({ address: "new@example.com" }));
      const list = unwrap(await uow.reads.accounts.list(makeAccount().workspaceId));
      expect(list.map((a) => a.address)).toEqual(["new@example.com"]);
    });
    it("remove deletes the account and leaves the others (guards removing the wrong account)", async () => {
      const { uow } = make();
      const second = makeAccount({ id: "acc-2" as Account["id"], address: "two@example.com" });
      await save(uow, makeAccount());
      await save(uow, second);
      const ws = makeAccount().workspaceId;
      const removed = await uow.run(async (tx) =>
        tx.repositories.accounts.remove(ws, makeAccount().id),
      );
      expect(removed.ok).toBe(true);
      expect(unwrap(await uow.reads.accounts.list(ws)).map((a) => a.id)).toEqual([second.id]);
    });
  });
}
