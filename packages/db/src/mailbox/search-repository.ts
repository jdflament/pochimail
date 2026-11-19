import type { Message } from "@pochimail/mailbox/model/message";
import type { Database } from "better-sqlite3-multiple-ciphers";
import { guard, sqlHelpers } from "../shared/sql.ts";
import { MESSAGE_COLUMNS, messageOf } from "./message-row.ts";

/** Repository over one connection. */
export function createSearchRepository(db: Database) {
  const { all } = sqlHelpers(db);
  /** Full-text search over sender, subject, snippet, category and signals, best match first. */
  function search(ws: string, accountId: string, query: string, limit: number) {
    return guard((): Message[] => {
      // Control characters (NUL truncates the match string) are separators, never part of a term.
      const terms = query
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
        .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
        .split(/\s+/)
        .filter((t) => t !== "")
        .map((t) => `"${t.replaceAll('"', '""')}"`);
      if (terms.length === 0) return [];
      const last = terms.length - 1;
      terms[last] = `${terms[last]}*`; // type-ahead: the last word may be a prefix
      return all(
        `SELECT ${MESSAGE_COLUMNS.split(", ")
          .map((c) => `m.${c}`)
          .join(", ")}
         FROM message_search s JOIN message m ON m.rowid = s.rowid
         WHERE message_search MATCH ? AND m.workspace_id = ? AND m.account_id = ?
         ORDER BY s.rank LIMIT ?`,
        terms.join(" "),
        ws,
        accountId,
        Math.max(1, Math.floor(limit)),
      ).map(messageOf);
    });
  }

  return search;
}
