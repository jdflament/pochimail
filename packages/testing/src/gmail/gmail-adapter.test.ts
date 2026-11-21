import { PartiallyApplied } from "@pochimail/actions/ports/mail-commands";
import { AuthExpired, ProviderFailed, RateLimited } from "@pochimail/kernel/errors";
import type { MessageId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import type { SyncCursor } from "@pochimail/mailbox/ports/mail-reader";
import type { MailProvider } from "@pochimail/workflows/ports/mail-provider";
import { describe, expect, it } from "vitest";
import { makeIncomingMessage } from "../fixtures.ts";
import { createGmailHarness } from "./gmail-harness.ts";

const live = () => new AbortController().signal;
const id = (n: number) => `msg-${n}` as MessageId;

async function drain(provider: MailProvider, from: SyncCursor | null) {
  const messages: string[] = [];
  const restarts: boolean[] = [];
  let cursor = from;
  for (let guard = 0; guard < 50; guard++) {
    const batch = unwrap(await provider.sync(cursor, live()));
    messages.push(...batch.messages.map((m) => m.id));
    restarts.push(batch.restarted);
    cursor = batch.nextCursor;
    if (!batch.hasMore) return { messages, cursor, restarts };
  }
  throw new Error("sync never finished");
}

const seed = (n: number) => Array.from({ length: n }, (_, i) => makeIncomingMessage(i + 1));

describe("Gmail adapter", () => {
  // Guards: a stale history id leaving the mailbox half-synced, or a restart that loses mail.
  it("an expired history id ends in the same state as a clean backfill, flagged restarted", async () => {
    const h = createGmailHarness({ pageSize: 2 });
    h.deliver(...seed(5));
    const clean = await drain(h.provider, null);
    h.deliver(makeIncomingMessage(6));
    h.server.expireHistory();
    const again = await drain(h.provider, clean.cursor);
    expect(again.restarts[0]).toBe(true);
    expect(again.restarts.slice(1).every((r) => !r)).toBe(true);
    expect([...again.messages].sort()).toEqual([1, 2, 3, 4, 5, 6].map(id).sort());
    const fresh = await drain(createGmailHarness({ pageSize: 2 }).provider, null);
    expect(fresh.cursor?.scope).toBe(again.cursor?.scope);
    // After the restart, deltas work again from the new position.
    h.deliver(makeIncomingMessage(7));
    expect((await drain(h.provider, again.cursor)).messages).toEqual([id(7)]);
  });

  // Guards: a hammered Gmail (wrong delay) or a silent retry loop on a dead token.
  it("maps a 429 to RateLimited with Retry-After and a 401 that survives a refresh to AuthExpired", async () => {
    const h = createGmailHarness();
    h.server.failNext(429, { retryAfter: "45" });
    const limited = await h.provider.sync(null, live());
    expect(!limited.ok && limited.error).toBeInstanceOf(RateLimited);
    expect(!limited.ok && limited.error instanceof RateLimited && limited.error.retryAfterMs).toBe(
      45_000,
    );
    const h2 = createGmailHarness();
    h2.server.failNext(401, { times: 2 });
    const expired = await h2.provider.sync(null, live());
    expect(!expired.ok && expired.error).toBeInstanceOf(AuthExpired);
  });

  // Guards: failing on an access token that merely expired, instead of refreshing it once.
  it("a 401 on a stale token refreshes it and retries once", async () => {
    const h = createGmailHarness();
    h.deliver(makeIncomingMessage(1));
    h.server.acceptOnly("access-2");
    expect(unwrap(await h.provider.sync(null, live())).messages).toHaveLength(1);
  });

  // Guards: privacy at the wire: a sync that asks Gmail for a subject, snippet or body.
  it("no sync request asks for a subject, snippet or body", async () => {
    const h = createGmailHarness({ pageSize: 2 });
    h.deliver(...seed(3));
    const first = await drain(h.provider, null);
    h.deliver(makeIncomingMessage(4));
    await drain(h.provider, first.cursor);
    const gets = h.server.requests().filter((r) => /^messages\/[^/]+$/.test(r.path));
    expect(gets.length).toBeGreaterThanOrEqual(4);
    for (const r of gets) {
      expect(r.query.get("format")).toBe("metadata");
      expect(r.query.getAll("metadataHeaders").sort()).toEqual(["From", "List-Unsubscribe", "To"]);
      expect(r.query.get("fields")).not.toMatch(/snippet|body|subject/i);
    }
    const synced = unwrap(await h.provider.sync(null, live())).messages;
    expect(synced.every((m) => m.subject === "" && m.snippet === "")).toBe(true);
  });

  // Guards: an archive that cannot be undone, or a trash that cannot be restored.
  it("archive then its inverse restores INBOX; trash then untrash restores the message", async () => {
    const h = createGmailHarness();
    h.deliver(makeIncomingMessage(1));
    const [archived] = unwrap(
      await h.provider.applyCommands([{ kind: "archive", messageIds: [id(1)] }], live()),
    );
    expect(h.server.labelsOf("msg-1")).not.toContain("INBOX");
    unwrap(
      await h.provider.applyCommands(
        [archived?.inverse ?? { kind: "archive", messageIds: [] }],
        live(),
      ),
    );
    expect(h.server.labelsOf("msg-1")).toContain("INBOX");
    const [trashed] = unwrap(
      await h.provider.applyCommands([{ kind: "trash", messageIds: [id(1)] }], live()),
    );
    expect(h.server.labelsOf("msg-1")).toContain("TRASH");
    expect((await drain(h.provider, null)).messages).toEqual([]);
    unwrap(
      await h.provider.applyCommands(
        [trashed?.inverse ?? { kind: "trash", messageIds: [] }],
        live(),
      ),
    );
    expect([...h.server.labelsOf("msg-1")].sort()).toEqual(["INBOX", "UNREAD"]);
    expect((await drain(h.provider, null)).messages).toEqual([id(1)]);
  });

  // Guards: a batch above Gmail's 1000-id limit, or a label that is applied without existing.
  it("splits batchModify at 1000 ids and creates a label before applying it", async () => {
    const h = createGmailHarness();
    const many = Array.from({ length: 1001 }, (_, i) => id(i + 1));
    unwrap(await h.provider.applyCommands([{ kind: "archive", messageIds: many }], live()));
    const calls = h.server.requests().filter((r) => r.path === "messages/batchModify");
    expect(calls.map((c) => (c.body as { ids: string[] }).ids.length)).toEqual([1000, 1]);
    h.deliver(makeIncomingMessage(1));
    unwrap(
      await h.provider.applyCommands(
        [{ kind: "apply-label", messageIds: [id(1)], label: "Receipts" }],
        live(),
      ),
    );
    expect(h.server.labelsOf("msg-1").some((l) => l.startsWith("Label_"))).toBe(true);
    expect(h.provider.capabilities).toMatchObject({
      batchModify: { maxCommands: 1000 },
      deltaSync: true,
      pushWakeups: false,
    });
  });

  // Guards: fetching display text from the wrong part, or storing what is fetched live.
  it("fetchBody returns the text part and fetchDisplayFields the subject, both read by id", async () => {
    const h = createGmailHarness();
    h.deliver(makeIncomingMessage(1, { subject: "Quarterly report", snippet: "Numbers inside" }));
    h.server.setBody("msg-1", "Hello, invented body");
    expect(unwrap(await h.provider.fetchBody(id(1), live()))).toBe("Hello, invented body");
    expect(unwrap(await h.provider.fetchDisplayFields(["msg-1"], live()))).toEqual([
      { id: "msg-1", subject: "Quarterly report", snippet: "Numbers inside" },
    ]);
  });

  // Guards: stale flags after the user reads, archives or labels mail in Gmail itself.
  it("re-reads messages whose labels changed in Gmail, and maps the size estimate", async () => {
    const h = createGmailHarness();
    h.deliver(makeIncomingMessage(1), makeIncomingMessage(2));
    const first = await drain(h.provider, null);
    const before = unwrap(await h.provider.sync(null, live())).messages.find(
      (m) => m.id === "msg-1",
    );
    expect(before?.opened).toBe(false);
    expect(typeof before?.size).toBe("number");
    h.server.markRead("msg-1");
    const batch = unwrap(await h.provider.sync(first.cursor, live()));
    expect(batch.messages.map((m) => [m.id, m.opened])).toEqual([["msg-1", true]]);
  });

  // Guards: an applied half-batch losing its undo when a later chunk fails.
  it("a failure part-way returns what was applied with its inverse", async () => {
    const h = createGmailHarness();
    const many = Array.from({ length: 1001 }, (_, i) => id(i + 1));
    h.server.failNext(500, { skip: 1 });
    const result = await h.provider.applyCommands([{ kind: "archive", messageIds: many }], live());
    expect(!result.ok && result.error).toBeInstanceOf(PartiallyApplied);
    const applied =
      !result.ok && result.error instanceof PartiallyApplied ? result.error.applied : [];
    expect(applied[0]?.command.messageIds).toHaveLength(1000);
    expect(applied[0]?.inverse).toMatchObject({ kind: "unarchive" });
  });

  // Guards: a missing message reported as an applied command that has an inverse.
  it("a 404 from Gmail is a failure, never an applied command", async () => {
    const h = createGmailHarness();
    h.server.failNext(404);
    const archived = await h.provider.applyCommands(
      [{ kind: "archive", messageIds: [id(1)] }],
      live(),
    );
    expect(!archived.ok && archived.error).toBeInstanceOf(ProviderFailed);
    h.server.failNext(404);
    const trashed = await h.provider.applyCommands(
      [{ kind: "trash", messageIds: [id(1)] }],
      live(),
    );
    expect(trashed.ok).toBe(false);
  });

  // Guards: a 403 quota error hammering Gmail again instead of cooling down like a 429.
  it("a 403 rateLimitExceeded is RateLimited and the account cools down without calling again", async () => {
    const h = createGmailHarness();
    h.server.failNext(403, { retryAfter: "20" });
    const first = await h.provider.sync(null, live());
    expect(!first.ok && first.error instanceof RateLimited && first.error.retryAfterMs).toBe(
      20_000,
    );
    const calls = h.server.requests().length;
    const second = await h.provider.sync(null, live());
    expect(!second.ok && second.error).toBeInstanceOf(RateLimited);
    expect(h.server.requests().length).toBe(calls);
  });
});
