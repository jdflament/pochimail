import type { SecretStore } from "@pochimail/accounts/ports/secret-store";
import { createInMemorySecretStore } from "@pochimail/accounts/testing/in-memory-secret-store";
import { Cancelled, Offline, StorageError } from "@pochimail/kernel/errors";
import { err } from "@pochimail/kernel/result";
import { egressPolicy } from "@pochimail/net/egress/allowlist";
import { createHttpClient, type Fetch } from "@pochimail/net/egress/http-client";
import { createOAuthFetch, type FetchLike } from "@pochimail/net/oauth/http";
import { oauthProviderConfig } from "@pochimail/net/oauth/providers";
import { createAccessTokenSource } from "@pochimail/net/oauth/tokens";
import { startFakeOAuthServer } from "@pochimail/testing/fake-oauth-server";
import { loopbackFetch } from "@pochimail/testing/loopback-fetch";
import { runOAuthTokenSourceContract } from "@pochimail/testing/oauth-token-source-contract";
import { expect, it } from "vitest";
import { createFakeClock } from "../fake-clock.ts";

const SECRET_KEY = "account/ws-a/acc_1";
const CLIENT_ID = "test-client-id";

const googleConfig = oauthProviderConfig("google");

runOAuthTokenSourceContract(async () => {
  const server = await startFakeOAuthServer();
  const secrets = createInMemorySecretStore();
  const clock = createFakeClock();
  const refreshToken = server.issueRefreshToken();
  await secrets.set(SECRET_KEY, refreshToken);
  return {
    source: createAccessTokenSource({
      config: { ...googleConfig, tokenUrl: server.tokenUrl },
      clientId: CLIENT_ID,
      env: {},
      secretKey: SECRET_KEY,
      secrets,
      fetch: loopbackFetch,
      now: () => clock.now(),
    }),
    server,
    secrets,
    clock,
    secretKey: SECRET_KEY,
    refreshToken,
  };
});

const sourceWith = (fetch: FetchLike) => {
  const secrets = createInMemorySecretStore();
  const clock = createFakeClock();
  void secrets.set(SECRET_KEY, "refresh-token");
  return createAccessTokenSource({
    config: googleConfig,
    clientId: CLIENT_ID,
    env: {},
    secretKey: SECRET_KEY,
    secrets,
    fetch,
    now: () => clock.now(),
  });
};

it("a token endpoint that is down is retryable, not a re-auth prompt (guards signing users out when the network fails)", async () => {
  const source = sourceWith(async () => ({ ok: false, status: 503, body: "unavailable" }));
  const result = await source.refresh(new AbortController().signal);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(Offline);
});

it("a token endpoint that never answers fails as Offline, not a hang (guards a refresh stuck past the timeout)", async () => {
  const hang: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const fetch = createOAuthFetch(
    createHttpClient({ allowlist: egressPolicy.create(), fetch: hang }),
    { timeoutMs: 20 },
  );
  const result = await sourceWith(fetch).refresh(new AbortController().signal);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(Offline);
});

it("an already-aborted request never reaches the network (guards a refresh after the user cancelled)", async () => {
  let calls = 0;
  const source = sourceWith(async () => {
    calls++;
    return { ok: false, status: 500, body: "" };
  });
  const controller = new AbortController();
  controller.abort();
  const result = await source.refresh(controller.signal);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(Cancelled);
  expect(calls).toBe(0);
});

it("two concurrent token calls share one refresh request (guards posting the same rotating token twice and a spurious needs_reauth)", async () => {
  const server = await startFakeOAuthServer({ rotateRefreshTokens: true });
  try {
    const secrets = createInMemorySecretStore();
    const clock = createFakeClock();
    await secrets.set(SECRET_KEY, server.issueRefreshToken());
    const source = createAccessTokenSource({
      config: { ...googleConfig, tokenUrl: server.tokenUrl },
      clientId: CLIENT_ID,
      env: {},
      secretKey: SECRET_KEY,
      secrets,
      fetch: loopbackFetch,
      now: () => clock.now(),
    });

    const [first, second] = await Promise.all([
      source.token(new AbortController().signal),
      source.refresh(new AbortController().signal),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(server.refreshRequests()).toBe(1);

    // The rotated token was written back: the next refresh still works instead of needing re-auth.
    clock.advance(2 * 60 * 60 * 1000);
    expect((await source.token(new AbortController().signal)).ok).toBe(true);
    expect(server.refreshRequests()).toBe(2);
  } finally {
    await server.close();
  }
});

it("a failed rotated-token write keeps the fresh access token usable (guards throwing away a valid token)", async () => {
  const server = await startFakeOAuthServer({ rotateRefreshTokens: true });
  try {
    const store = createInMemorySecretStore();
    await store.set(SECRET_KEY, server.issueRefreshToken());
    const lockedKeychain: SecretStore = {
      get: (key) => store.get(key),
      set: async () => err(new StorageError("keychain locked")),
      remove: (key) => store.remove(key),
    };
    const source = createAccessTokenSource({
      config: { ...googleConfig, tokenUrl: server.tokenUrl },
      clientId: CLIENT_ID,
      env: {},
      secretKey: SECRET_KEY,
      secrets: lockedKeychain,
      fetch: loopbackFetch,
    });

    const refreshed = await source.refresh(new AbortController().signal);
    expect(refreshed.ok).toBe(false);
    if (!refreshed.ok) expect(refreshed.error).toBeInstanceOf(StorageError);
    // The provider rotated the token, but the caller can still use the access token it just got.
    expect((await source.token(new AbortController().signal)).ok).toBe(true);
  } finally {
    await server.close();
  }
});

it("a refresh sends the client secret from env (guards a refresh that silently drops it)", async () => {
  const server = await startFakeOAuthServer();
  const secrets = createInMemorySecretStore();
  await secrets.set(SECRET_KEY, server.issueRefreshToken());
  const source = createAccessTokenSource({
    config: { ...googleConfig, tokenUrl: server.tokenUrl },
    clientId: CLIENT_ID,
    env: { POCHIMAIL_GOOGLE_CLIENT_SECRET: "fake-client-secret" },
    secretKey: SECRET_KEY,
    secrets,
    fetch: loopbackFetch,
  });
  expect((await source.token(new AbortController().signal)).ok).toBe(true);
  const refresh = server.requests().find((r) => r.params.grant_type === "refresh_token");
  expect(refresh?.params.client_secret).toBe("fake-client-secret");
  await server.close();
});
