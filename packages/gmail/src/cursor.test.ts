import { expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./cursor.ts";

// Guards: a resume that loses its place (page token, start history id) or trusts a foreign cursor.
it("round-trips both positions and starts over on a cursor it did not write", () => {
  const backfill = { kind: "backfill", startHistoryId: "42", pageToken: "p2" } as const;
  const history = { kind: "history", historyId: "43", pageToken: "" } as const;
  expect(decodeCursor(encodeCursor(backfill))).toEqual(backfill);
  expect(decodeCursor(encodeCursor(history))).toEqual(history);
  expect(decodeCursor(null)).toBeNull();
  expect(decodeCursor({ scope: "inbox", token: "garbage" })).toBeNull();
});
