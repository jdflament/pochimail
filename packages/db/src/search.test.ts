import type { MessageId } from "@pochimail/kernel/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import { ACCOUNT_1, WS_A } from "@pochimail/testing/fixtures";
import { describe, expect, it } from "vitest";
import { harness, mail, put } from "./test-support/harness.ts";

const WS_B_ID = "ws-b" as typeof WS_A;

describe("full-text search", () => {
  it("finds by subject, sender, snippet prefix, category and signal, and not by a word that was never stored (guards wrong matches; the body guarantee is the schema tests above)", async () => {
    const h = harness();
    const BODY = "zanzibarquartz";
    await put(h, [
      mail(1, { subject: "Quarterly invoice", from: "billing@acme.example" }),
      mail(2, { subject: "Lunch?", snippet: "short preview" }),
    ]);
    // A provider body would only ever exist in memory; nothing in the schema can take it.
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "invoice", 10)).map((m) => m.id)).toEqual([
      "msg-1",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "acme", 10)).map((m) => m.id)).toEqual([
      "msg-1",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "prev", 10)).map((m) => m.id)).toEqual([
      "msg-2",
    ]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, BODY, 10))).toEqual([]);
    expect(unwrap(await h.search.search(WS_B_ID, ACCOUNT_1, "invoice", 10))).toEqual([]);
    // Query syntax typed by a user is data, not FTS5 operators.
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, 'invoice" OR "', 10))).toEqual([]);
  });

  it("follows a category change and replaced signals (guards a stale index)", async () => {
    const h = harness();
    await put(h, [mail(1, { subject: "Hello" })]);
    await h.uow.run((tx) =>
      tx.repositories.messages.setCategory(WS_A, "msg-1" as MessageId, "promotions"),
    );
    await h.uow.run(async (tx) => {
      await tx.repositories.signals.replaceForMessages(
        WS_A,
        ["msg-1" as MessageId],
        [
          {
            schemaVersion: 1,
            workspaceId: WS_A,
            messageId: "msg-1" as MessageId,
            kind: "time-sensitive",
            confidence: 0.7,
            detectedAt: "2026-01-01T00:00:00.000Z",
            reason: "A deadline is near",
          },
        ],
      );
      return ok(undefined);
    });
    const ids = async (q: string) =>
      unwrap(await h.search.search(WS_A, ACCOUNT_1, q, 5)).map((m) => m.id);
    expect(await ids("promotions")).toEqual(["msg-1"]);
    expect(await ids("time-sensitive")).toEqual(["msg-1"]);
    await h.uow.run(async (tx) =>
      tx.repositories.signals.replaceForMessages(WS_A, ["msg-1" as MessageId], []),
    );
    expect(await ids("time-sensitive")).toEqual([]);
  });
});

describe("search input", () => {
  it("treats NUL and other control characters as separators and never throws (guards a hostile search box breaking search)", async () => {
    const h = harness();
    await put(h, [mail(1, { subject: "Quarterly invoice" })]);
    const ids = async (q: string) =>
      unwrap(await h.search.search(WS_A, ACCOUNT_1, q, 5)).map((m) => m.id);
    expect(await ids("invoice\u0000junk")).toEqual([]);
    expect(await ids("quarterly\u0000invoice")).toEqual(["msg-1"]);
    expect(await ids("\u0000")).toEqual([]);
    expect(await ids("\u0001\u001f invoice")).toEqual(["msg-1"]);
  });
});
