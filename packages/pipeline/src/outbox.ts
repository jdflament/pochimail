import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { JobRequest } from "./job-queue.ts";

/** What a transaction produces besides rows: an event for the bus, or a job for the queue. */
export type OutboxEntry =
  | { readonly kind: "event"; readonly event: EventEnvelope }
  | { readonly kind: "job"; readonly workspaceId: WorkspaceId; readonly job: JobRequest };

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
