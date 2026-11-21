import type { SyncCursor } from "@pochimail/mailbox/ports/mail-reader";

/** Scope of the single Gmail cursor an account keeps. */
export const GMAIL_CURSOR_SCOPE = "inbox";

/**
 * Where a sync stands. `backfill` walks `messages.list` newest to oldest and remembers the
 * history id taken when it began, so the deltas after it miss nothing. `history` follows
 * `history.list` from a history id (with a page token while one is open).
 */
export type GmailPosition =
  | { readonly kind: "backfill"; readonly startHistoryId: string; readonly pageToken: string }
  | { readonly kind: "history"; readonly historyId: string; readonly pageToken: string };

export function encodeCursor(position: GmailPosition): SyncCursor {
  const token =
    position.kind === "backfill"
      ? `b|${position.startHistoryId}|${position.pageToken}`
      : `h|${position.historyId}|${position.pageToken}`;
  return { scope: GMAIL_CURSOR_SCOPE, token };
}

/** `null` for a cursor this adapter did not write: the caller starts a fresh backfill. */
export function decodeCursor(cursor: SyncCursor | null): GmailPosition | null {
  if (cursor === null) return null;
  const [kind, id, pageToken = ""] = cursor.token.split("|");
  if (id === undefined || id === "") return null;
  if (kind === "b") return { kind: "backfill", startHistoryId: id, pageToken };
  if (kind === "h") return { kind: "history", historyId: id, pageToken };
  return null;
}
