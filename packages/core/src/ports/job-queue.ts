import type { Cancelled, ErrorCode, StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";

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
  readonly attempts: number;
}

export interface JobQueue {
  enqueue(workspaceId: WorkspaceId, job: JobRequest): AsyncResult<void, StorageError>;
  /** Waits for the next due job of one of `types`; `ok(null)` when `signal` aborts or none is due. */
  claim(
    types: readonly string[],
    signal: CancelSignal,
  ): AsyncResult<Job | null, StorageError | Cancelled>;
  complete(jobId: string): AsyncResult<void, StorageError>;
  /** `retryAt` absent: the job is dead-lettered. */
  fail(jobId: string, code: ErrorCode, retryAt?: string): AsyncResult<void, StorageError>;
}
