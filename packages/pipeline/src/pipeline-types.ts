import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { DomainError, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { JobQueue } from "./job-queue.ts";
import type { RetryPolicy } from "./retry.ts";

/**
 * One step of the pipeline (e.g. parse, classify, detect signals). Items are handled one by one;
 * `concurrency` caps how many items this stage works on at once.
 *
 * Stages must be idempotent: a failed item is re-run from its failing stage by the retry
 * worker, and a crash before a cursor commit replays that batch.
 */
export interface Stage<In, Out> {
  readonly name: string;
  readonly concurrency: number;
  process(item: In): AsyncResult<Out, DomainError>;
}

/** Opaque position in a source; only `token` is persisted, under `scope`. */
export interface PipelineCursor {
  readonly scope: string;
  readonly token: string;
}

export interface CursorStore {
  get(scope: string): AsyncResult<PipelineCursor | null, StorageError>;
  set(cursor: PipelineCursor): AsyncResult<void, StorageError>;
}

export interface SourceBatch<T> {
  readonly items: readonly T[];
  /** Only its `token` is kept; stored under the pipeline's scope. Persisted once every item of this batch left the last stage (or went to the retry queue). */
  readonly nextCursor: PipelineCursor;
  readonly hasMore: boolean;
}

/** Same shape as `MailProvider.sync`, minus provider specifics. */
export type PipelineSource<T> = (
  cursor: PipelineCursor | null,
  signal: CancelSignal,
) => AsyncResult<SourceBatch<T>, DomainError>;

export interface PipelineOptions<T> {
  /** Names the retry job type (`<name>.retry`) and the cursor scope: unique per pipeline. */
  readonly name: string;
  readonly workspaceId: WorkspaceId;
  readonly source: PipelineSource<T>;
  /** Where the pipeline's position is kept, already bound to its owner by the caller. */
  readonly cursors: CursorStore;
  readonly queue: JobQueue;
  readonly clock: Clock;
  readonly random: () => number;
  /** Stable identity of an item; dedupes its retry job. */
  readonly itemKey: (item: T) => string;
  /** Batches fetched but not yet committed, i.e. the memory bound. Default 2. */
  readonly maxInFlightBatches?: number;
  readonly retryPolicy?: RetryPolicy;
}

export interface RunReport {
  /** `paused`: the signal aborted; everything fetched so far was finished and committed. */
  readonly status: "completed" | "paused";
  readonly batches: number;
  /** Items that went through every stage. */
  readonly processed: number;
  /** Items handed to the retry queue. */
  readonly deferred: number;
}

export interface RetryReport {
  readonly succeeded: number;
  readonly retried: number;
  readonly deadLettered: number;
}

export interface Pipeline {
  /**
   * Streams batches source → stages with at most `maxInFlightBatches` uncommitted batches, so a
   * slow stage stops the source from fetching. Resumes from the persisted cursor. Aborting
   * `signal` pauses at a batch boundary: nothing new is fetched, in-flight batches finish and
   * commit, so a later `run` neither loses nor repeats an item.
   */
  run(signal: CancelSignal): AsyncResult<RunReport, StorageError | DomainError>;
  /** Re-runs deferred items from their failing stage; failures back off or dead-letter. */
  drainRetries(signal: CancelSignal): AsyncResult<RetryReport, StorageError>;
}

export interface PipelineBuilder<T> {
  stage<Out>(stage: Stage<T, Out>): PipelineBuilder<Out>;
  build(): Pipeline;
}
