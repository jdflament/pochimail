import { MissingClientConfig, ProviderFailed, SignInCancelled } from "@pochimail/core/errors";
import type { FetchLike } from "@pochimail/net/oauth/http";
import { type OAuthProviderConfig, oauthProviderConfig } from "@pochimail/net/oauth/providers";
import { OAuthSignIn } from "@pochimail/net/oauth/sign-in";
import { type FakeOAuthServer, startFakeOAuthServer } from "@pochimail/testing/fake-oauth-server";
import { loopbackFetch } from "@pochimail/testing/loopback-fetch";
import { expect, it, vi } from "vitest";

const live = () => new AbortController().signal;
const CLIENT_ID = "test-client-id.apps.example";

/** The provider config with its endpoints pointed at the local fake (no real Google/Microsoft call). */
const localConfig = (
  server: FakeOAuthServer,
  provider: "google" | "microsoft" = "google",
): OAuthProviderConfig => ({
  ...oauthProviderConfig(provider),
  authorizeUrl: server.authorizeUrl,
  tokenUrl: server.tokenUrl,
  revokeUrl: server.revokeUrl,
});

const ENV = {
  POCHIMAIL_GOOGLE_CLIENT_ID: CLIENT_ID,
  POCHIMAIL_MICROSOFT_CLIENT_ID: CLIENT_ID,
};

/** A "browser": opens the consent URL and follows the one redirect back to the loopback listener. */
const followRedirect =
  (opened: string[]) =>
  async (url: string): Promise<void> => {
    opened.push(url);
    const consent = await fetch(url, { redirect: "manual" });
    const location = consent.headers.get("location");
    if (location === null) throw new Error("the authorization server did not redirect");
    // The navigation is not awaited: a real browser returns from `openExternal` immediately.
    void fetch(location).catch(() => undefined);
  };

const isRefused = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch {
    return true;
  }
};

it("signs in for suggest with PKCE, the modify scope and the configured client id (guards a non-PKCE, over-scoped flow)", async () => {
  const server = await startFakeOAuthServer();
  try {
    const opened: string[] = [];
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: followRedirect(opened),
      fetch: loopbackFetch,
    });
    const result = await signIn.execute(
      { provider: "google", autonomy: "suggest", config: localConfig(server) },
      live(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.refreshToken).toMatch(/^refresh-/);
    expect(result.value.accessToken).toMatch(/^access-/);
    expect(result.value.accountProvider).toBe("gmail");
    expect(result.value.scopes).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(result.value.scopes).not.toContain("https://www.googleapis.com/auth/gmail.readonly");

    const authorize = server.requests().find((request) => request.path === "/authorize");
    expect(authorize?.params.client_id).toBe(CLIENT_ID);
    expect(authorize?.params.response_type).toBe("code");
    expect(authorize?.params.code_challenge_method).toBe("S256");
    expect(authorize?.params.state?.length ?? 0).toBeGreaterThan(20);
    const exchange = server.requests().find((request) => request.path === "/token");
    expect(exchange?.params.grant_type).toBe("authorization_code");
    expect(exchange?.params.code_verifier?.length ?? 0).toBeGreaterThan(40);
    expect(exchange?.params.redirect_uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  } finally {
    await server.close();
  }
});

it("signs in to just look with the read-only scope only (guards asking for write access nobody uses)", async () => {
  const server = await startFakeOAuthServer();
  try {
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: followRedirect([]),
      fetch: loopbackFetch,
    });
    const result = await signIn.execute(
      { provider: "microsoft", autonomy: "just-look", config: localConfig(server, "microsoft") },
      live(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scopes).toContain("Mail.Read");
    expect(result.value.scopes).not.toContain("Mail.ReadWrite");
    const authorize = server.requests().find((request) => request.path === "/authorize");
    expect(authorize?.params.response_mode).toBe("query");
  } finally {
    await server.close();
  }
});

it("a build without a client id fails typed before opening a browser (guards a hard-coded or missing client id)", async () => {
  const opened = vi.fn();
  const signIn = new OAuthSignIn({ env: {}, openBrowser: opened, fetch: loopbackFetch });
  const result = await signIn.execute({ provider: "google", autonomy: "just-look" }, live());
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(MissingClientConfig);
    expect((result.error as MissingClientConfig).provider).toBe("google");
  }
  expect(opened).not.toHaveBeenCalled();
});

it("a consent the user cancels returns SignInCancelled, not a failure (guards a scary error after Cancel)", async () => {
  const server = await startFakeOAuthServer();
  try {
    server.denyNextConsent();
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: followRedirect([]),
      fetch: loopbackFetch,
    });
    const result = await signIn.execute(
      { provider: "google", autonomy: "just-look", config: localConfig(server) },
      live(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(SignInCancelled);
  } finally {
    await server.close();
  }
});

it("a token exchange the provider refuses is a typed provider failure, never a grant (guards half-signed-in accounts)", async () => {
  const server = await startFakeOAuthServer();
  try {
    const refusing: FetchLike = async (url, init) =>
      url === server.tokenUrl
        ? { ok: false, status: 400, body: '{"error":"invalid_grant"}' }
        : loopbackFetch(url, init);
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: followRedirect([]),
      fetch: refusing,
    });
    const result = await signIn.execute(
      { provider: "google", autonomy: "just-look", config: localConfig(server) },
      live(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProviderFailed);
  } finally {
    await server.close();
  }
});

it("cancelling after the browser opened frees the loopback port (guards a port left listening)", async () => {
  const server = await startFakeOAuthServer();
  try {
    let opened: string | undefined;
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: async (url) => {
        opened = url;
      },
      fetch: loopbackFetch,
    });
    const controller = new AbortController();
    const running = signIn.execute(
      { provider: "google", autonomy: "just-look", config: localConfig(server) },
      controller.signal,
    );
    await vi.waitFor(() => expect(opened).toBeDefined());
    controller.abort();
    const result = await running;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(SignInCancelled);
    const redirectUri = new URL(opened ?? "").searchParams.get("redirect_uri");
    expect(redirectUri).not.toBeNull();
    expect(await isRefused(redirectUri ?? "")).toBe(true);
  } finally {
    await server.close();
  }
});

it("a sign-in nobody answers times out and frees the port (guards a listener hanging for minutes)", async () => {
  const server = await startFakeOAuthServer();
  try {
    let redirectUri: string | null = null;
    const signIn = new OAuthSignIn({
      env: ENV,
      openBrowser: async (url) => {
        redirectUri = new URL(url).searchParams.get("redirect_uri");
      },
      fetch: loopbackFetch,
      timeoutMs: 25,
    });
    const result = await signIn.execute(
      { provider: "google", autonomy: "just-look", config: localConfig(server) },
      live(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(SignInCancelled);
    expect(redirectUri).not.toBeNull();
    expect(await isRefused(redirectUri ?? "")).toBe(true);
  } finally {
    await server.close();
  }
});
