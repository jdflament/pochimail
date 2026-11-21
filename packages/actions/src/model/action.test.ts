import type { MessageId } from "@pochimail/kernel/ids";
import { expect, it } from "vitest";
import { ACTION_KINDS, type Command, inverseOf } from "./action.ts";

const ids = ["msg-1" as MessageId];

// Guards: a delete that cannot be undone, or a permanent-delete kind sneaking into the action set.
it("trash and untrash are each other's inverse, and no permanent delete exists (ADR 0012)", () => {
  const trash: Command = { kind: "trash", messageIds: ids };
  expect(inverseOf(trash)).toEqual({ kind: "untrash", messageIds: ids });
  expect(inverseOf({ kind: "untrash", messageIds: ids })).toEqual(trash);
  expect(ACTION_KINDS).not.toContain("delete");
});
