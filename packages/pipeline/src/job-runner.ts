import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { DomainError, ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import { Gate, Queue } from "./concurrency.ts";
import type { JobQueue } from "./job-queue.ts";
import { nackJob, type RetryPolicy } from "./retry.ts";

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

type AnyStage = Stage<never, unknown>;

interface RetryPayload {
  readonly stage: number;
  readonly item: unknown;
}

export function createPipeline<In>(options: PipelineOptions<In>): PipelineBuilder<In> {
  return builder<In>(options as PipelineOptions<unknown>, []);
}

function builder<T>(options: PipelineOptions<unknown>, stages: readonly AnyStage[]) {
  return {
    stage<Out>(stage: Stage<T, Out>): PipelineBuilder<Out> {
      return builder<Out>(options, [...stages, stage]);
    },
    build: () => buildPipeline(options, stages),
  };
}

interface InFlight {
  readonly seq: number;
  readonly cursor: PipelineCursor;
  items: unknown[];
}

function buildPipeline(options: PipelineOptions<unknown>, stages: readonly AnyStage[]): Pipeline {
  const retryType = `${options.name}.retry`;
  const maxInFlight = Math.max(1, options.maxInFlightBatches ?? 2);

  /** Stage-wide cap on concurrent items, shared by every batch in flight and the retry worker. */
  const stageGates = stages.map((s) => new Gate(Math.max(1, s.concurrency)));
  const never: CancelSignal = {
    aborted: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const runStages = async (
    from: number,
    items: readonly unknown[],
    onFailure?: (stage: number, item: unknown, error: DomainError) => Promise<void>,
  ): Promise<unknown[]> => {
    let current = [...items];
    for (let s = from; s < stages.length; s += 1) {
      const stage = stages[s] as AnyStage;
      const out: unknown[] = [];
      let cursor = 0;
      const lane = async () => {
        while (cursor < current.length) {
          const item = current[cursor] as never;
          cursor += 1;
          const gate = stageGates[s] as Gate;
          await gate.acquire(never);
          const r = await stage.process(item).finally(() => gate.release());
          if (r.ok) out.push(r.value);
          else if (onFailure) await onFailure(s, item, r.error);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, stage.concurrency) }, lane));
      current = out;
    }
    return current;
  };

  return {
    async run(signal) {
      const cursorResult = await options.cursors.get(options.name);
      if (!cursorResult.ok) return err(cursorResult.error);
      let cursor = cursorResult.value;

      const gate = new Gate(maxInFlight);
      const finished = new Map<number, InFlight>();
      let nextToCommit = 0;
      let outstanding = 0;
      let fatal: StorageError | DomainError | undefined;
      /** The source failed: in-flight batches still finish and commit, then the run reports it. */
      let sourceError: DomainError | undefined;
      let crash: { error: unknown } | undefined;
      let batches = 0;
      let processed = 0;
      let deferred = 0;
      let idle: (() => void) | undefined;

      const stop = (e?: StorageError | DomainError) => {
        if (e) fatal ??= e;
        gate.close();
      };
      /** A batch left the pipeline (committed or abandoned): free its in-flight slot. */
      const settle = () => {
        outstanding -= 1;
        gate.release();
        if (outstanding === 0) idle?.();
      };
      /** Cursors advance strictly in fetch order, even when batches finish out of order. */
      const commitReady = async () => {
        for (let next = finished.get(nextToCommit); next; next = finished.get(nextToCommit)) {
          finished.delete(nextToCommit);
          const w = await options.cursors.set(next.cursor);
          if (!w.ok) {
            stop(w.error);
            settle();
            // Later finished batches stay uncommitted, so a restart replays them.
            for (const _ of finished.keys()) settle();
            finished.clear();
            return;
          }
          nextToCommit += 1;
          settle();
        }
      };

      const work = new Queue<InFlight>();
      const worker = async () => {
        for (let batch = await work.take(); batch; batch = await work.take()) {
          if (fatal || crash) {
            settle();
            continue;
          }
          try {
            let unqueued = false;
            const out = await runStages(0, batch.items, async (s, item) => {
              const queued = await options.queue.enqueue(options.workspaceId, {
                type: retryType,
                payload: { stage: s, item } satisfies RetryPayload,
                idempotencyKey: `${options.name}:${(stages[s] as AnyStage).name}:${options.itemKey(item)}`,
              });
              if (queued.ok) deferred += 1;
              else {
                unqueued = true;
                stop(queued.error);
              }
            });
            if (unqueued) {
              // An item could not be parked: leave the batch uncommitted so it is replayed.
              settle();
              continue;
            }
            if (fatal) {
              settle();
              continue;
            }
            processed += out.length;
            finished.set(batch.seq, batch);
            await commitReady();
          } catch (error) {
            crash ??= { error };
            stop();
            settle();
          }
        }
      };
      const workers = Array.from({ length: maxInFlight }, worker);

      let paused = false;
      let more = true;
      let seq = 0;
      while (more) {
        if (!(await gate.acquire(signal))) {
          paused = signal.aborted && !fatal && !crash;
          break;
        }
        const fetched = await options.source(cursor, signal);
        if (!fetched.ok) {
          gate.release();
          if (fetched.error.code === "operation.cancelled") paused = true;
          else sourceError = fetched.error;
          break;
        }
        const batch = fetched.value;
        batches += 1;
        outstanding += 1;
        cursor = { scope: options.name, token: batch.nextCursor.token };
        more = batch.hasMore;
        work.push({ seq, cursor, items: [...batch.items] });
        seq += 1;
      }

      if (outstanding > 0) await new Promise<void>((resolve) => (idle = resolve));
      work.close();
      await Promise.all(workers);

      if (crash) throw crash.error;
      if (fatal) return err(fatal);
      if (sourceError) return err(sourceError);
      return ok({ status: paused ? "paused" : "completed", batches, processed, deferred });
    },

    async drainRetries(signal) {
      let succeeded = 0;
      let retried = 0;
      let deadLettered = 0;
      while (!signal.aborted) {
        const claimed = await options.queue.claim([retryType], signal);
        if (!claimed.ok) return err(claimed.error as StorageError);
        const job = claimed.value;
        if (!job) break;
        const payload = job.payload as RetryPayload;
        let failure: ErrorCode | undefined;
        await runStages(payload.stage, [payload.item], async (_s, _item, error) => {
          failure = error.code;
        });
        if (failure === undefined) {
          const c = await options.queue.complete(job.id, job.lease);
          if (!c.ok) return err(c.error);
          succeeded += 1;
        } else {
          const n = await nackJob(options.queue, job, failure, {
            clock: options.clock,
            random: options.random,
            ...(options.retryPolicy ? { policy: options.retryPolicy } : {}),
          });
          if (!n.ok) return err(n.error);
          if (n.value === "retry") retried += 1;
          else deadLettered += 1;
        }
      }
      return ok({ succeeded, retried, deadLettered });
    },
  };
}
