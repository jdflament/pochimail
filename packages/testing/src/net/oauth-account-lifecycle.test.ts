import type { Account } from "@pochimail/accounts/model/account";
import { createInMemorySecretStore } from "@pochimail/accounts/testing/in-memory-secret-store";
import { accountSecretKey, ConnectAccount } from "@pochimail/accounts/use-cases/connect-account";
import { MarkAccountNeedsReauth } from "@pochimail/accounts/use-cases/mark-account-needs-reauth";
import { RemoveAccount } from "@pochimail/accounts/use-cases/remove-account";
import { AuthExpired, Cancelled } from "@pochimail/kernel/errors";
import { oauthProviderConfig, scopeUpgradeNeeded } from "@pochimail/net/oauth/providers";
import { createOAuthRevoker } from "@pochimail/net/oauth/revoke";
import { createAccessTokenSource } from "@pochimail/net/oauth/tokens";
import type { OutboxEntry } from "@pochimail/pipeline/outbox";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import { startFakeOAuthServer } from "@pochimail/testing/fake-oauth-server";
import { makeIncomingMessage, WS_A } from "@pochimail/testing/fixtures";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { loopbackFetch } from "@pochimail/testing/loopback-fetch";
import { domainEventSchema } from "@pochimail/workflows/events";
import { RunIncrementalSync } from "@pochimail/workflows/use-cases/run-incremental-sync";
import { expect, it } from "vitest";
import { createFakeClock } from "../fake-clock.ts";

const live = () => new AbortController().signal;
const CLIENT_ID = "test-client-id";

const setup = () => {
  const store = createInMemoryUnitOfWork();
  const secrets = createInMemorySecretStore();
  const clock = createFakeClock();
  let last = 0;
  const ids = { next: (prefix: string) => `${prefix}_${++last}` };
  const connect = new ConnectAccount({ uow: store.uow, secrets, clock, ids });
  return { store, secrets, clock, ids, connect };
};

const connectAccount = async (
  ctx: ReturnType<typeof setup>,
  over: {
    provider: "gmail" | "graph";
    address: string;
    credentials: string;
    grantedScopes?: readonly string[];
  },
): Promise<Account> => {
  const connected = await ctx.connect.execute({ workspaceId: WS_A, ...over }, live());
  if (!connected.ok) throw connected.error;
  return connected.value.account;
};

const accountStates = async (entries: readonly OutboxEntry[]) => {
  const states: Array<{ accountId: string; state: string }> = [];
  for (const entry of entries) {
    if (entry.kind !== "event") continue;
    const parsed = domainEventSchema.safeParse(entry.event);
    if (parsed.success && parsed.data.type === "AccountStateChanged") {
      states.push({
        accountId: parsed.data.payload.accountId,
        state: parsed.data.payload.state,
      });
    }
  }
  return states;
};

it("a dead refresh token marks only that account needs_reauth while another account keeps syncing (guards one dead token stopping every account)", async () => {
  const ctx = setup();
  const server = await startFakeOAuthServer();
  try {
    const broken = await connectAccount(ctx, {
      provider: "gmail",
      address: "broken@example.com",
      credentials: "revoked-refresh-token",
    });
    const healthy = await connectAccount(ctx, {
      provider: "gmail",
      address: "healthy@example.com",
      credentials: "good-refresh-token",
    });
    server.revokeRefreshToken("revoked-refresh-token");
    const tokenSource = createAccessTokenSource({
      config: { ...oauthProviderConfig("google"), tokenUrl: server.tokenUrl },
      clientId: CLIENT_ID,
      env: {},
      secretKey: accountSecretKey(broken),
      secrets: ctx.secrets,
      fetch: loopbackFetch,
      now: () => ctx.clock.now(),
    });

    const refreshed = await tokenSource.refresh(live());
    expect(refreshed.ok).toBe(false);
    if (!refreshed.ok) expect(refreshed.error).toBeInstanceOf(AuthExpired);

    const marked = await new MarkAccountNeedsReauth({
      uow: ctx.store.uow,
      clock: ctx.clock,
    }).execute({ workspaceId: WS_A, accountId: broken.id }, live());
    expect(marked.ok).toBe(true);

    const provider = createFakeMailProvider({ pageSize: 10 });
    provider.deliver(makeIncomingMessage(1, { accountId: healthy.id, workspaceId: WS_A }));
    const sync = await new RunIncrementalSync({
      uow: ctx.store.uow,
      provider,
      clock: ctx.clock,
    }).execute({ workspaceId: WS_A, accountId: healthy.id }, live());
    expect(sync.ok).toBe(true);
    if (sync.ok) expect(sync.value.status).toBe("completed");

    const states = await accountStates(await ctx.store.committedOutbox());
    expect(states.filter((s) => s.accountId === broken.id).at(-1)?.state).toBe("needs_reauth");
    expect(states.filter((s) => s.accountId === healthy.id).at(-1)?.state).toBe("connected");
  } finally {
    await server.close();
  }
});

it("stores the scopes granted at sign-in with the account, so raising autonomy knows a re-prompt is needed (guards a consent that never happens)", async () => {
  const ctx = setup();
  const google = oauthProviderConfig("google");
  const account = await connectAccount(ctx, {
    provider: "gmail",
    address: "scopes@example.com",
    credentials: "refresh-scopes",
    grantedScopes: google.scopes.read,
  });

  const stored = await ctx.store.uow.reads.accounts.get(WS_A, account.id);
  expect(stored.ok).toBe(true);
  if (!stored.ok) return;
  expect(stored.value.grantedScopes).toEqual(google.scopes.read);
  expect(scopeUpgradeNeeded(google, stored.value.grantedScopes, "just-look")).toBe(false);
  expect(scopeUpgradeNeeded(google, stored.value.grantedScopes, "suggest")).toBe(true);
});

it("removing an account revokes the token at the provider, then deletes the secret and the local data (guards credentials left behind)", async () => {
  const ctx = setup();
  const server = await startFakeOAuthServer();
  try {
    const account = await connectAccount(ctx, {
      provider: "gmail",
      address: "remove@example.com",
      credentials: "refresh-to-revoke",
    });
    const revoker = createOAuthRevoker({
      fetch: loopbackFetch,
      configs: {
        google: { ...oauthProviderConfig("google"), revokeUrl: server.revokeUrl },
      },
    });
    const removed = await new RemoveAccount({
      uow: ctx.store.uow,
      secrets: ctx.secrets,
      revoker,
      clock: ctx.clock,
    }).execute({ workspaceId: WS_A, accountId: account.id }, live());
    expect(removed.ok).toBe(true);
    if (removed.ok) expect(removed.value.remoteRevoked).toBe(true);

    const revoke = server.requests().find((request) => request.path === "/revoke");
    expect(revoke?.params.token).toBe("refresh-to-revoke");
    expect(await ctx.secrets.get(accountSecretKey(account))).toEqual({
      ok: true,
      value: null,
    });
    const row = await ctx.store.uow.reads.accounts.get(WS_A, account.id);
    expect(row.ok).toBe(false);
    const states = await accountStates(await ctx.store.committedOutbox());
    expect(states.at(-1)?.state).toBe("disconnected");
  } finally {
    await server.close();
  }
});

it("removal still wipes the credential when the provider cannot be reached (guards a network failure keeping a token on disk)", async () => {
  const ctx = setup();
  const account = await connectAccount(ctx, {
    provider: "gmail",
    address: "offline@example.com",
    credentials: "refresh-offline",
  });
  const revoker = createOAuthRevoker({
    configs: {
      // Loopback port 1: never a real provider host, and unreachable by design.
      google: { ...oauthProviderConfig("google"), revokeUrl: "http://127.0.0.1:1/revoke" },
    },
    fetch: async () => {
      throw new Error("network down");
    },
  });
  const removed = await new RemoveAccount({
    uow: ctx.store.uow,
    secrets: ctx.secrets,
    revoker,
    clock: ctx.clock,
  }).execute({ workspaceId: WS_A, accountId: account.id }, live());
  expect(removed.ok).toBe(true);
  if (removed.ok) expect(removed.value.remoteRevoked).toBe(false);
  expect(await ctx.secrets.get(accountSecretKey(account))).toEqual({ ok: true, value: null });
  expect((await ctx.store.uow.reads.accounts.get(WS_A, account.id)).ok).toBe(false);
});

it("a cancellation during removal changes nothing (guards a half-removed account)", async () => {
  const ctx = setup();
  const account = await connectAccount(ctx, {
    provider: "gmail",
    address: "cancel@example.com",
    credentials: "refresh-cancel",
  });
  const controller = new AbortController();
  controller.abort();
  const revoker = createOAuthRevoker({
    fetch: async () => {
      throw new Error("must not be called");
    },
  });
  const removed = await new RemoveAccount({
    uow: ctx.store.uow,
    secrets: ctx.secrets,
    revoker,
    clock: ctx.clock,
  }).execute({ workspaceId: WS_A, accountId: account.id }, controller.signal);
  expect(removed.ok).toBe(false);
  if (!removed.ok) expect(removed.error).toBeInstanceOf(Cancelled);
  expect(await ctx.secrets.get(accountSecretKey(account))).toEqual({
    ok: true,
    value: "refresh-cancel",
  });
  expect((await ctx.store.uow.reads.accounts.get(WS_A, account.id)).ok).toBe(true);
});
