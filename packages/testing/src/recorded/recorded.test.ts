import { describe, expect, it } from "vitest";
import { createFakeClock } from "../fake-clock.ts";
import { generateMailbox } from "../fixture-mailbox/generator.ts";
import { readMailbox } from "../fixture-mailbox/mailbox-reader.ts";
import { createHttpReplay, loadRecording, scripts } from "./http-replay.ts";
import { gmailRecording } from "./http-wire.ts";
import { assertScrubbed, findScrubViolations } from "./scrub.ts";

const small = generateMailbox({ seed: 20261117, scale: "small" });
const account = small.accounts[0];
if (!account) throw new Error("generator returned no account");
const ids = { accountId: account.id, workspaceId: small.workspaceId };
const signal = () => new AbortController().signal;

describe("scrubber", () => {
  it("fails on a planted access token (guards a recorded Authorization secret reaching git)", () => {
    expect(() => assertScrubbed("t", '{"access_token":"ya29.a0AfH6SMBx1234567890abcdef"}')).toThrow(
      /not scrubbed.*token/,
    );
    expect(
      findScrubViolations("Authorization: Bearer abcdefghijklmnop1234").length,
    ).toBeGreaterThan(0);
    expect(
      findScrubViolations("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJl").length,
    ).toBeGreaterThan(0);
  });

  it("fails on a real-looking address and never echoes it in full (guards personal data in fixtures)", () => {
    const text = "from: jane.doe@gmail.com";
    expect(findScrubViolations(text)).toEqual([{ kind: "address", excerpt: "jane.doe@gma" }]);
    expect(() => assertScrubbed("t", text)).toThrow(/not scrubbed/);
    expect(() => assertScrubbed("t", text)).not.toThrow(/gmail\.com/);
  });

  it("accepts reserved example domains (guards false alarms that make people disable the check)", () => {
    expect(findScrubViolations("a@example.com b@shop.example.net c@fixture.example")).toEqual([]);
  });

  it("finds nothing in the generated mailbox or its recordings (guards the generator leaking real data)", () => {
    // Decoded content: base64 transfer encoding of plain text would otherwise look like a token.
    for (const a of small.accounts) assertScrubbed(a.id, JSON.stringify(readMailbox(a.mbox, ids)));
    const messages = readMailbox(account.mbox, ids);
    assertScrubbed("gmail", JSON.stringify(gmailRecording(messages)));
  });

  it("refuses to load a recording that contains a token", () => {
    const dirty = JSON.stringify({
      version: 1,
      entries: [
        {
          request: {
            method: "GET",
            url: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
          },
          response: {
            status: 200,
            headers: { authorization: "Bearer abcdefghijklmnop1234" },
            body: "{}",
          },
        },
      ],
    });
    expect(() => loadRecording("dirty", dirty)).toThrow(/not scrubbed/);
  });
});

describe("http replay", () => {
  const url = "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1";
  const entry = (
    response: Parameters<typeof createHttpReplay>[0]["entries"][number]["response"],
  ) => ({
    request: { method: "GET" as const, url },
    response,
  });

  it("throws on an unrecorded request instead of inventing a reply (guards an adapter drifting off its recording)", async () => {
    const replay = createHttpReplay({ version: 1, entries: [] });
    await expect(replay.fetch(url, { signal: signal() })).rejects.toThrow(/No recorded response/);
    expect(replay.unmatched()).toHaveLength(1);
  });

  it("answers a scripted 429 with Retry-After, then recovers (guards retry logic that never sees the hint)", async () => {
    const replay = createHttpReplay({
      version: 1,
      entries: [entry(scripts.throttled(30)), entry({ status: 200, body: "{}" })],
    });
    const first = await replay.fetch(url, { signal: signal() });
    expect(first.status).toBe(429);
    expect(first.headers.get("Retry-After")).toBe("30");
    expect((await replay.fetch(url, { signal: signal() })).status).toBe(200);
    expect((await replay.fetch(url, { signal: signal() })).status).toBe(200);
  });

  it("computes an HTTP-date Retry-After from the injected clock (guards tests that depend on wall time)", () => {
    const clock = createFakeClock(new Date("2026-01-01T00:00:00.000Z"));
    const response = scripts.throttledUntil(clock, 90);
    expect(response.headers["retry-after"]).toBe("Thu, 01 Jan 2026 00:01:30 GMT");
  });

  it("matches a request whatever the query parameter order (guards brittle fixtures)", async () => {
    const replay = createHttpReplay({
      version: 1,
      entries: [
        {
          request: { method: "GET", url: "https://graph.microsoft.com/v1.0/me/messages?b=2&a=1" },
          response: { status: 200, body: "x" },
        },
      ],
    });
    const response = await replay.fetch("https://graph.microsoft.com/v1.0/me/messages?a=1&b=2", {
      signal: signal(),
    });
    expect(await response.text()).toBe("x");
  });

  it("scripts an expired cursor and a dropped connection", async () => {
    const replay = createHttpReplay({
      version: 1,
      entries: [entry(scripts.expiredCursor(404))],
    });
    expect((await replay.fetch(url, { signal: signal() })).status).toBe(404);
    const dropped = createHttpReplay({ version: 1, entries: [entry(scripts.droppedConnection())] });
    await expect(dropped.fetch(url, { signal: signal() })).rejects.toThrow("fetch failed");
  });
});
