import type { StorageError } from "../errors.ts";
import type { AsyncResult } from "./common.ts";
import type { OutboxEntry } from "./unit-of-work.ts";

export interface OutboxRecord {
  /** Stable row id; the relay marks it delivered by this id. */
  readonly id: string;
  readonly entry: OutboxEntry;
}

/**
 * Read side of the transactional outbox, used by the relay. Rows are written only through
 * `Transaction.outbox` (so they commit with the state change) and appear here after commit.
 */
export interface OutboxStore {
  /** Up to `limit` undelivered rows in append order. Rows of a rolled-back transaction never appear. */
  pending(limit: number): AsyncResult<readonly OutboxRecord[], StorageError>;
  /** Idempotent: marking a delivered row again is `ok`. */
  markDelivered(id: string): AsyncResult<void, StorageError>;
}
