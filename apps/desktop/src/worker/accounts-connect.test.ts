// Guards: a sign-in that leaks a token to the renderer, stores one outside the keychain, or leaves the person on a wrong state.
import { createInMemorySecretStore } from "@pochimail/accounts/testing/in-memory-secret-store";
import { ConnectAccount } from "@pochimail/accounts/use-cases/connect-account";
import { WorkspaceId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { type OAuthProviderConfig, oauthProviderConfig } from "@pochimail/net/oauth/providers";
import { OAuthSignIn } from "@pochimail/net/oauth/sign-in";
import { type FakeOAuthServer, startFakeOAuthServer } from "@pochimail/testing/fake-oauth-server";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { loopbackFetch } from "@pochimail/testing/loopback-fetch";
import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient } from "../shared/ipc/client.ts";
import { serveRpc } from "../shared/ipc/server.ts";
import { fromDomPort } from "../shared/ipc/transport.ts";
import { createAccountProcedures } from "./account-procedures.ts";

const workspaceId = unwrap(WorkspaceId("wsp_00000000-0000-4000-8000-000000000001"));
const servers: FakeOAuthServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

/** Real sign-in code against the fake authorization server; the "browser" follows the one redirect. */
const setup = async (options: {
  address?: string;
  env?: Record<string, string>;
  deny?: boolean;
}) => {
  const server = await startFakeOAuthServer(
    options.address === undefined ? {} : { address: options.address },
  );
  servers.push(server);
  if (options.deny) server.denyNextConsent();
  const config: OAuthProviderConfig = {
    ...oauthProviderConfig("google"),
    authorizeUrl: server.authorizeUrl,
    tokenUrl: server.tokenUrl,
  };
  const signIn = new OAuthSignIn({
    env: options.env ?? { POCHIMAIL_GOOGLE_CLIENT_ID: "test-client" },
    fetch: loopbackFetch,
    openBrowser: async (url) => {
      const consent = await fetch(url, { redirect: "manual" });
      const location = consent.headers.get("location");
      if (location !== null) void fetch(location).catch(() => undefined);
    },
  });
  const store = createInMemoryUnitOfWork();
  const secrets = createInMemorySecretStore();
  const procedures = createAccountProcedures({
    workspaceId,
    uow: store.uow,
    connectAccount: new ConnectAccount({
      uow: store.uow,
      secrets,
      clock: { now: () => new Date("2026-11-21T10:00:00.000Z") },
      ids: { next: (prefix) => `${prefix}_${crypto.randomUUID()}` },
    }),
    signIn: (signal) => signIn.execute({ provider: "google", autonomy: "suggest", config }, signal),
  });
  const { port1, port2 } = new MessageChannel();
  serveRpc(fromDomPort(port2), { procedures, subscriptions: {} });
  const client = createRpcClient(fromDomPort(port1));
  return {
    client,
    secrets,
    close: () => {
      port1.close();
      port2.close();
    },
  };
};

describe("accounts.connect", () => {
  it("connects through the real sign-in, answers only the account id and keeps the token in the keychain", async () => {
    const { client, secrets, close } = await setup({ address: "person@example.test" });
    const outcome = await client.call("accounts.connect", { provider: "google" });
    expect(outcome.status).toBe("connected");
    expect(Object.keys(outcome).sort()).toEqual(["accountId", "status"]);
    expect(JSON.stringify(outcome)).not.toMatch(/refresh-|access-/);

    const accounts = await client.call("accounts.list");
    expect(accounts).toEqual([
      {
        id: outcome.status === "connected" ? outcome.accountId : "",
        provider: "google",
        displayName: "person@example.test",
      },
    ]);
    expect(await client.call("app.state")).toEqual({ status: "ready", hasConnectedAccount: true });
    const stored = await secrets.get(`account/${workspaceId}/${accounts[0]?.id}`);
    expect(stored.ok && stored.value).toMatch(/^refresh-/);
    close();
  });

  it("answers cancelled when the person refuses consent, and connects nothing", async () => {
    const { client, close } = await setup({ address: "person@example.test", deny: true });
    expect(await client.call("accounts.connect", { provider: "google" })).toEqual({
      status: "cancelled",
    });
    expect(await client.call("accounts.list")).toEqual([]);
    close();
  });

  it("answers a closed failure reason without the provider's message", async () => {
    const missing = await setup({ address: "person@example.test", env: {} });
    expect(await missing.client.call("accounts.connect", { provider: "google" })).toEqual({
      status: "failed",
      reason: "not-configured",
    });
    missing.close();
    const noAddress = await setup({});
    expect(await noAddress.client.call("accounts.connect", { provider: "google" })).toEqual({
      status: "failed",
      reason: "unknown",
    });
    noAddress.close();
  });
});
