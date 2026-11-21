import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import { expect, it } from "vitest";
import type { GmailMetadata } from "./api.ts";
import { toIncoming } from "./mapping.ts";

const identity = { workspaceId: "ws-a" as WorkspaceId, accountId: "acc-1" as AccountId };
const raw = (over: Partial<GmailMetadata> = {}): GmailMetadata => ({
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX", "UNREAD"],
  sizeEstimate: 900,
  internalDate: String(Date.UTC(2026, 0, 2)),
  payload: {
    headers: [
      { name: "From", value: "Ada <Ada@Example.com>" },
      { name: "To", value: 'a@example.com, "B" <b@example.com>' },
      { name: "List-Unsubscribe", value: "<mailto:u@example.com>" },
    ],
  },
  ...over,
});

// Guards: a record that stores more than ids, dates, flags and addresses, or flags that read wrong.
it("maps metadata to the minimal record with empty subject and snippet", () => {
  expect(toIncoming(raw(), identity)).toMatchObject({
    id: "m1",
    threadId: "t1",
    from: "ada@example.com",
    to: ["a@example.com", "b@example.com"],
    subject: "",
    snippet: "",
    receivedAt: "2026-01-02T00:00:00.000Z",
    hasListUnsubscribe: true,
    opened: false,
  });
  expect(
    toIncoming(
      raw({
        labelIds: ["INBOX"],
        payload: { headers: [{ name: "From", value: "a@example.com" }] },
      }),
      identity,
    ),
  ).toMatchObject({
    opened: true,
    hasListUnsubscribe: false,
  });
});

// Guards: a half-stored message when Gmail returns something we cannot use.
it("skips a message without a usable sender or date", () => {
  expect(toIncoming(raw({ payload: { headers: [] } }), identity)).toBeNull();
  expect(toIncoming(raw({ internalDate: "soon" }), identity)).toBeNull();
});
