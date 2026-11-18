import { RateLimited } from "@pochimail/core/errors";
import { AccountId } from "@pochimail/core/ids";
import { unwrap } from "@pochimail/core/result";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { generateMailbox } from "@pochimail/testing/fixture-mailbox/generator";
import { readMailbox } from "@pochimail/testing/fixture-mailbox/mailbox-reader";
import { createHttpReplay, type Recording, scripts } from "@pochimail/testing/recorded/http-replay";
import {
  GMAIL_BASE,
  gmailRecording,
  graphRecording,
  readGmailMailbox,
  readGraphMailbox,
} from "@pochimail/testing/recorded/http-wire";
import { protocolContract } from "@pochimail/testing/recorded/protocol-contract";
import { startScriptedImapServer } from "@pochimail/testing/recorded/scripted-imap-server";
import { readMailboxOverTestOnlyImap } from "@pochimail/testing/recorded/test-only-imap-client";
import { afterAll, describe, expect, it } from "vitest";
import { BlockedSocketError, egressPolicy } from "./allowlist.ts";
import { BlockedHostError, createHttpClient, RequestFailedError } from "./http-client.ts";
import { createRateLimitedClient } from "./rate-limit.ts";

const SEED = 20261117;
const small = generateMailbox({ seed: SEED, scale: "small" });
const [gmailAccount, graphAccount] = small.accounts;
if (!gmailAccount || !graphAccount) throw new Error("generator returned no accounts");
const ids = (a: { id: string }) => ({ accountId: a.id, workspaceId: small.workspaceId });
const gmailMessages = readMailbox(gmailAccount.mbox, ids(gmailAccount));
const graphMessages = readMailbox(graphAccount.mbox, ids(graphAccount));

/** The replay is the HttpClient transport, so the real allow-list still gates every request. */
const clientFor = (recording: Recording) => {
  const replay = createHttpReplay(recording);
  const client = createHttpClient({ allowlist: egressPolicy.create(), fetch: replay.fetch });
  return { replay, client };
};

const servers: { close(): Promise<void> }[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

protocolContract("Gmail replay serves the fixture mailbox", () => {
  const { client, replay } = clientFor(gmailRecording(gmailMessages, { pageSize: 50 }));
  return {
    expected: gmailMessages.map((m) => m.message),
    read: async () => {
      const out = await readGmailMailbox(client, ids(gmailAccount), 50);
      expect(replay.unmatched()).toEqual([]);
      return out;
    },
  };
});

protocolContract("Graph replay serves the fixture mailbox", () => {
  const { client, replay } = clientFor(graphRecording(graphMessages, { pageSize: 50 }));
  return {
    expected: graphMessages.map((m) => m.message),
    read: async () => {
      const out = await readGraphMailbox(client, ids(graphAccount), 50);
      expect(replay.unmatched()).toEqual([]);
      return out;
    },
  };
});

protocolContract("Scripted IMAP server serves the fixture mailbox", async () => {
  const server = await startScriptedImapServer({ mbox: gmailAccount.mbox });
  servers.push(server);
  const allowlist = egressPolicy.create();
  allowlist.addAccount({
    accountId: unwrap(AccountId(gmailAccount.id)),
    imap: { host: server.host, port: server.port },
  });
  return {
    expected: gmailMessages.map((m) => m.message),
    read: async () => {
      return readMailboxOverTestOnlyImap(server.port, ids(gmailAccount), {
        assertSocketAllowed: allowlist.assertSocketAllowed,
      });
    },
  };
});

describe("recorded fixtures behind the egress client", () => {
  it("blocks a recorded host that is not on the allow-list before replay is reached (guards a fixture bypassing egress)", async () => {
    const { replay, client } = clientFor({
      version: 1,
      entries: [
        {
          request: { method: "GET", url: "https://tracker.example.net/v1" },
          response: { status: 200, body: "{}" },
        },
      ],
    });
    const result = await client.request({ url: "https://tracker.example.net/v1" });
    expect(!result.ok && result.error).toBeInstanceOf(BlockedHostError);
    expect(replay.requests()).toEqual([]);
  });

  it("opens no IMAP socket to the scripted server until the account registered it (guards a test reader that bypasses assertSocketAllowed)", async () => {
    const server = await startScriptedImapServer({ mbox: gmailAccount.mbox });
    servers.push(server);
    const allowlist = egressPolicy.create();
    await expect(
      readMailboxOverTestOnlyImap(server.port, ids(gmailAccount), {
        assertSocketAllowed: allowlist.assertSocketAllowed,
      }),
    ).rejects.toBeInstanceOf(BlockedSocketError);
    expect(server.connectionsAccepted()).toBe(0);
  });

  it("surfaces a scripted 429 with Retry-After as RateLimited and recovers after the wait (guards M2-07 paths nobody exercises)", async () => {
    const clock = createFakeClock();
    const url = `${GMAIL_BASE}/messages?maxResults=1`;
    const { client: inner, replay } = clientFor({
      version: 1,
      entries: [
        { request: { method: "GET", url }, response: scripts.throttled(30) },
        { request: { method: "GET", url }, response: { status: 200, body: '{"messages":[]}' } },
      ],
    });
    const limited = createRateLimitedClient({
      inner,
      clock,
      random: () => 0.5,
      sleep: async () => true,
    });
    const account = { id: unwrap(AccountId("acc-replay")), provider: "gmail" as const };
    const first = await limited.request({ url, account });
    expect(!first.ok && first.error).toBeInstanceOf(RateLimited);
    if (!first.ok && first.error instanceof RateLimited)
      expect(first.error.retryAfterMs).toBe(30_000);
    // Cooling down: no second call reaches the provider until the clock passes Retry-After.
    expect((await limited.request({ url, account })).ok).toBe(false);
    expect(replay.requests()).toHaveLength(1);
    clock.advance(30_001);
    const recovered = await limited.request({ url, account });
    expect(recovered.ok && recovered.value.status).toBe(200);
  });

  it("reports an expired cursor as a 404 the caller can act on, and a dropped connection as a request failure", async () => {
    const url = `${GMAIL_BASE}/history?startHistoryId=1`;
    const { client } = clientFor({
      version: 1,
      entries: [
        { request: { method: "GET", url }, response: scripts.expiredCursor(404) },
        { request: { method: "GET", url: `${url}0` }, response: scripts.droppedConnection() },
      ],
    });
    const expired = await client.request({ url });
    expect(expired.ok && expired.value.status).toBe(404);
    const dropped = await client.request({ url: `${url}0` });
    expect(!dropped.ok && dropped.error).toBeInstanceOf(RequestFailedError);
  });
});
