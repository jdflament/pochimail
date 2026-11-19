import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { DomainError, ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import { Gate, Queue } from "./concurrency.ts";
import type { JobQueue } from "./job-queue.ts";
import type {
  CursorStore,
  Pipeline,
  PipelineBuilder,
  PipelineCursor,
  PipelineOptions,
  Stage,
} from "./pipeline-types.ts";
import { nackJob } from "./retry.ts";

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
