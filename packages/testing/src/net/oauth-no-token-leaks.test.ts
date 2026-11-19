import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInMemorySecretStore } from "@pochimail/accounts/testing/in-memory-secret-store";
import { accountSecretKey, ConnectAccount } from "@pochimail/accounts/use-cases/connect-account";
import { createLogger } from "@pochimail/logger/logger";
import { oauthProviderConfig } from "@pochimail/net/oauth/providers";
import { OAuthSignIn } from "@pochimail/net/oauth/sign-in";
import { startFakeOAuthServer } from "@pochimail/testing/fake-oauth-server";
import { WS_A } from "@pochimail/testing/fixtures";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { loopbackFetch } from "@pochimail/testing/loopback-fetch";
import { expect, it } from "vitest";
import { createFakeClock } from "../fake-clock.ts";

const OAUTH_DIR = join(import.meta.dirname, "../../../net/src/oauth");
const CLIENT_ID = "test-client-id";

const followRedirect = async (url: string): Promise<void> => {
  const consent = await fetch(url, { redirect: "manual" });
  const location = consent.headers.get("location");
  if (location !== null) void fetch(location).catch(() => undefined);
};

it("no OAuth source file writes to a console or a logger (guards a token added to a log line later)", () => {
  const files = readdirSync(OAUTH_DIR).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  expect(files.length).toBeGreaterThan(5);
  for (const file of files) {
    const source = readFileSync(join(OAUTH_DIR, file), "utf8");
    expect(source, `${file} logs`).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
    expect(source, `${file} uses a logger`).not.toMatch(/logger\.(?:debug|info|warn|error)/);
  }
});

it("tokens stay out of rows, the secret store keeps only the refresh token, and the logger redacts either (guards a token on disk or in a log)", async () => {
  const server = await startFakeOAuthServer();
  try {
    const signIn = new OAuthSignIn({
      env: { POCHIMAIL_GOOGLE_CLIENT_ID: CLIENT_ID },
      openBrowser: followRedirect,
      fetch: loopbackFetch,
    });
    const grant = await signIn.execute(
      {
        provider: "google",
        autonomy: "just-look",
        config: {
          ...oauthProviderConfig("google"),
          authorizeUrl: server.authorizeUrl,
          tokenUrl: server.tokenUrl,
        },
      },
      new AbortController().signal,
    );
    expect(grant.ok).toBe(true);
    if (!grant.ok) return;

    const store = createInMemoryUnitOfWork();
    const secrets = createInMemorySecretStore();
    let last = 0;
    const connected = await new ConnectAccount({
      uow: store.uow,
      secrets,
      clock: createFakeClock(),
      ids: { next: (prefix) => `${prefix}_${++last}` },
    }).execute(
      {
        workspaceId: WS_A,
        provider: "gmail",
        address: "leak@example.com",
        credentials: grant.value.refreshToken,
        grantedScopes: grant.value.scopes,
      },
      new AbortController().signal,
    );
    expect(connected.ok).toBe(true);
    if (!connected.ok) return;

    expect(await secrets.get(accountSecretKey(connected.value.account))).toEqual({
      ok: true,
      value: grant.value.refreshToken,
    });
    const rows = JSON.stringify(await store.snapshot());
    expect(rows).not.toContain(grant.value.refreshToken);
    expect(rows).not.toContain(grant.value.accessToken);

    const records: unknown[] = [];
    const logger = createLogger({ sink: { write: (record) => records.push(record) } });
    logger.info("sign-in", {
      token: grant.value.accessToken,
      refreshToken: grant.value.refreshToken,
    });
    const logged = JSON.stringify(records);
    expect(logged).not.toContain(grant.value.accessToken);
    expect(logged).not.toContain(grant.value.refreshToken);
  } finally {
    await server.close();
  }
});
