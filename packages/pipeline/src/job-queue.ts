import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";

export interface JobRequest {
  readonly type: string;
  /** Plain JSON; carries sync cursors and page tokens so a restart resumes mid-backfill. */
  readonly payload: unknown;
  /** Enqueuing the same key twice yields one job. */
  readonly idempotencyKey: string;
  readonly runAt?: string;
}

export interface Job extends JobRequest {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  /** Claims so far, this one included; lease-expiry redeliveries count too. */
  readonly attempts: number;
  /** Proves this consumer still owns the job; present on claimed jobs. See `JobQueue`. */
  readonly lease?: string;
}

/**
 * Persistent queue with leases (ADR 0003). Delivery is AT-LEAST-ONCE.
 *
 * - `claim` leases a due job for a bounded time. A lease that expires without `complete` or
 *   `fail` makes the job claimable again by any consumer (attempts counts it), so a crashed
 *   worker never strands a job.
 * - `complete` (ack) and `fail` (nack) take the `lease` of the claimed `Job`. Once the lease
 *   expired and the job was redelivered, the old holder's ack is refused with `Err`, so a slow
 *   consumer cannot acknowledge work another consumer is still running.
 * - `fail` with `retryAt` re-queues the job for then; without it the job is dead-lettered.
 *   Callers pick `retryAt` with `nackJob` (exponential backoff + jitter, dead-letter at max attempts).
 */
export interface JobQueue {
  enqueue(workspaceId: WorkspaceId, job: JobRequest): AsyncResult<void, StorageError>;
  /** Waits for the next due job of one of `types`; `ok(null)` when `signal` aborts or none is due. */
  claim(
    types: readonly string[],
    signal: CancelSignal,
  ): AsyncResult<Job | null, StorageError | Cancelled>;
  complete(jobId: string, lease?: string): AsyncResult<void, StorageError>;
  fail(
    jobId: string,
    code: ErrorCode,
    retryAt?: string,
    lease?: string,
  ): AsyncResult<void, StorageError>;
}
