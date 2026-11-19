import type { Page } from "@pochimail/core/ports/common";
import { z } from "zod";
import type { Row } from "./sql.ts";

// Opaque cursors: the sort key of the last row served, JSON in base64url.
const encodeCursor = (...key: (string | number)[]) =>
  Buffer.from(JSON.stringify(key)).toString("base64url");
export function decodeCursor<N extends number>(cursor: string, length: N): (string | number)[] {
  const key = z
    .array(z.union([z.string(), z.number()]))
    .length(length)
    .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  return key;
}

/** `rows` holds up to `limit + 1` rows: the extra one only says there is a next page. */
export function page<T>(
  rows: readonly Row[],
  limit: number,
  map: (row: Row) => T,
  key: (row: Row) => (string | number)[],
): Page<T> {
  const served = rows.slice(0, limit);
  const last = served.at(-1);
  return {
    items: served.map(map),
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(...key(last)) : null,
  };
}
