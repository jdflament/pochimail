// Guards: a credential left in a row or on the device, a missing lifecycle event, or one account's failure pausing the others.
import type { IdGenerator } from "@pochimail/kernel/id-generator";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";
import { accountRepositoryContract } from "./testing/account-repository-contract.ts";
import { createInMemoryAccounts } from "./testing/in-memory-accounts.ts";
import { createInMemorySecretStore } from "./testing/in-memory-secret-store.ts";
import { secretStoreContract } from "./testing/secret-store-contract.ts";
import { ConnectAccount } from "./use-cases/connect-account.ts";
import { ListAccounts } from "./use-cases/list-accounts.ts";
import { MarkAccountNeedsReauth } from "./use-cases/mark-account-needs-reauth.ts";
import { RemoveAccount } from "./use-cases/remove-account.ts";

const ws = "ws-a" as WorkspaceId;
const live = () => ({ aborted: false, addEventListener() {}, removeEventListener() {} });
const clock = { now: () => new Date("2026-02-02T00:00:00.000Z") };
let n = 0;
const ids: IdGenerator = { next: (prefix) => `${prefix}_${++n}` };

accountRepositoryContract(() => createInMemoryAccounts());
secretStoreContract(() => createInMemorySecretStore());

function stack() {
  const accounts = createInMemoryAccounts();
  const secrets = createInMemorySecretStore();
  const revoked: string[] = [];
  const revoker = {
    revoke: async (_provider: string, token: string) => {
      revoked.push(token);
      return { ok: true, value: undefined } as const;
    },
  };
  return { ...accounts, secrets, revoked, revoker };
}

describe("accounts use cases", () => {
  it("connects once, keeps the credentials out of the row and announces it (guards a token in a row or a missing event)", async () => {
    const s = stack();
    const connect = new ConnectAccount({ uow: s.uow, secrets: s.secrets, clock, ids });
    const request = {
      workspaceId: ws,
      provider: "gmail",
      address: "Owner@Example.com",
      credentials: "refresh-secret",
    } as const;
    const first = unwrap(await connect.execute(request, live()));
    expect(first.status).toBe("connected");
    expect(JSON.stringify(first.account)).not.toContain("refresh-secret");
    expect(s.committedEvents().map((e) => e.type)).toEqual([
      "AccountConnected",
      "AccountStateChanged",
    ]);
    const again = unwrap(await connect.execute(request, live()));
    expect(again.status).toBe("already-connected");
    expect(s.committedEvents()).toHaveLength(2);
    expect(unwrap(await new ListAccounts({ uow: s.uow }).execute(ws))).toHaveLength(1);
  });

  it("removes the account, its credentials and revokes at the provider (guards a credential left on the device)", async () => {
    const s = stack();
    const connect = new ConnectAccount({ uow: s.uow, secrets: s.secrets, clock, ids });
    const { account } = unwrap(
      await connect.execute(
        { workspaceId: ws, provider: "gmail", address: "a@example.com", credentials: "tok" },
        live(),
      ),
    );
    const remove = new RemoveAccount({ uow: s.uow, secrets: s.secrets, revoker: s.revoker, clock });
    const done = unwrap(await remove.execute({ workspaceId: ws, accountId: account.id }, live()));
    expect(done.remoteRevoked).toBe(true);
    expect(s.revoked).toEqual(["tok"]);
    expect(unwrap(await new ListAccounts({ uow: s.uow }).execute(ws))).toEqual([]);
    expect(s.committedEvents().at(-1)).toMatchObject({
      type: "AccountStateChanged",
      payload: { state: "disconnected" },
    });
  });

  it("marks only the named account as needing re-authentication (guards pausing everything)", async () => {
    const s = stack();
    const connect = new ConnectAccount({ uow: s.uow, secrets: s.secrets, clock, ids });
    const { account } = unwrap(
      await connect.execute(
        { workspaceId: ws, provider: "gmail", address: "a@example.com", credentials: "tok" },
        live(),
      ),
    );
    const mark = new MarkAccountNeedsReauth({ uow: s.uow, clock });
    unwrap(await mark.execute({ workspaceId: ws, accountId: account.id }, live()));
    expect(s.committedEvents().at(-1)).toMatchObject({
      payload: { accountId: account.id, state: "needs_reauth" },
    });
  });
});
