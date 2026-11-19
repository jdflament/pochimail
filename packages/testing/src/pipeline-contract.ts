import { Offline } from "@pochimail/core/errors";
import type { AccountId } from "@pochimail/core/ids";
import type { CursorRepository } from "@pochimail/core/ports/repositories";
import { type DomainError, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import type { JobQueue } from "@pochimail/pipeline/job-queue";
import { createPipeline, type PipelineSource, type Stage } from "@pochimail/pipeline/job-runner";
import type { RetryPolicy } from "@pochimail/pipeline/retry";
import { describe, expect, it } from "vitest";
import type { FakeClock } from "./fake-clock.ts";

export interface PipelineContractHarness {
  /** Persisted cursors; shared by every pipeline instance of one test (a "restart"). */
  readonly cursors: CursorRepository;
  readonly queue: JobQueue;
  /** The clock the queue reads for `runAt`. */
  readonly clock: FakeClock;
  deadLetters(): Promise<readonly { jobId: string }[]>;
}

const ws = "ws-pipe" as WorkspaceId;
const account = "acc-pipe" as AccountId;
const policy: RetryPolicy = { maxAttempts: 2, baseDelayMs: 1_000, maxDelayMs: 1_000 };

/** Lets promise continuations run without timers (no sleeps). */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}

/** `count` batches of `size` items named `i<n>`; the cursor token is the next batch index. */
function batchesSource(
  count: number,
  size: number,
  hooks: { onFetch?: (index: number, cursorToken: string | null) => DomainError | undefined } = {},
): PipelineSource<string> {
  return async (cursor) => {
    const index = cursor === null ? 0 : Number(cursor.token);
    const failure = hooks.onFetch?.(index, cursor?.token ?? null);
    if (failure) return err(failure);
    const items = Array.from({ length: size }, (_, n) => `i${index * size + n}`);
    return ok({
      items,
      nextCursor: { scope: "ignored", token: String(index + 1) },
      hasMore: index + 1 < count,
    });
  };
}

/**
 * Contract for the staged pipeline over any `CursorRepository` + `JobQueue` (in-memory, SQLite).
 * Exported so M2 adapters reuse it unchanged. `make` returns fresh, empty ports.
 */
export function runPipelineContract(
  make: () => PipelineContractHarness | Promise<PipelineContractHarness>,
): void {
  describe("Pipeline contract (backpressure, pause/resume, cursors, retries)", () => {
    const build = (
      h: PipelineContractHarness,
      source: PipelineSource<string>,
      stages: readonly Stage<string, string>[],
      maxInFlightBatches = 2,
    ) => {
      let b = createPipeline<string>({
        name: "sync",
        workspaceId: ws,
        source,
        cursors: {
          get: (scope) => h.cursors.get(ws, account, scope),
          set: (cursor) => h.cursors.set(ws, account, cursor),
        },
        queue: h.queue,
        clock: h.clock,
        random: () => 0,
        itemKey: (i) => i,
        maxInFlightBatches,
        retryPolicy: policy,
      });
      for (const s of stages) b = b.stage(s) as typeof b;
      return b.build();
    };
    const pass = (name: string, onItem?: (item: string) => void): Stage<string, string> => ({
      name,
      concurrency: 1,
      process: async (item) => (onItem?.(item), ok(item)),
    });

    it("stops fetching when a slow stage falls behind (guards unbounded memory growth)", async () => {
      const h = await make();
      let fetched = 0;
      let committed = 0;
      const waiting: (() => void)[] = [];
      const release = () => {
        for (const w of waiting.splice(0)) w();
      };
      let open = false;
      let inStage = 0;
      let peakInStage = 0;
      const slow: Stage<string, string> = {
        name: "slow",
        concurrency: 2,
        process: async (item) => {
          inStage += 1;
          peakInStage = Math.max(peakInStage, inStage);
          if (!open) await new Promise<void>((r) => waiting.push(r));
          inStage -= 1;
          return ok(item);
        },
      };
      const cursors: CursorRepository = {
        get: h.cursors.get,
        set: async (...a) => {
          committed += 1;
          return h.cursors.set(...a);
        },
      };
      const pipeline = build(
        { ...h, cursors },
        batchesSource(10, 3, {
          onFetch: () => {
            fetched += 1;
            return undefined;
          },
        }),
        [pass("fast"), slow],
      );
      const run = pipeline.run(new AbortController().signal);
      await settle();
      expect(fetched).toBe(2);
      expect(peakInStage).toBeLessThanOrEqual(2);
      for (let step = 0; step < 4; step += 1) {
        release();
        await settle();
        expect(fetched - committed).toBeLessThanOrEqual(2);
      }
      open = true;
      release();
      expect(unwrap(await run).status).toBe("completed");
      expect(fetched).toBe(10);
      expect(peakInStage).toBeLessThanOrEqual(2);
    });

    it("processes every item exactly once across a pause and resume (guards lost or duplicated items)", async () => {
      const h = await make();
      const seen = new Map<string, number>();
      const stage = pass("count", (i) => seen.set(i, (seen.get(i) ?? 0) + 1));
      const pause = new AbortController();
      const source = batchesSource(6, 3, {
        onFetch: (index) => (index === 2 ? (pause.abort(), undefined) : undefined),
      });
      const first = unwrap(await build(h, source, [stage]).run(pause.signal));
      expect(first.status).toBe("paused");
      expect(seen.size).toBeLessThan(18);
      const second = unwrap(await build(h, source, [stage]).run(new AbortController().signal));
      expect(second.status).toBe("completed");
      expect(seen.size).toBe(18);
      expect([...seen.values()].every((n) => n === 1)).toBe(true);
    });

    it("restarts after the last committed batch (guards re-processing committed batches)", async () => {
      const h = await make();
      const seen: string[] = [];
      const stage = pass("count", (i) => seen.push(i));
      const crashed = await build(
        h,
        batchesSource(5, 2, { onFetch: (i) => (i === 3 ? new Offline() : undefined) }),
        [stage],
      ).run(new AbortController().signal);
      expect(crashed.ok).toBe(false);
      expect(seen).toHaveLength(6);

      const starts: (string | null)[] = [];
      const resumed = await build(
        h,
        batchesSource(5, 2, { onFetch: (_i, token) => (starts.push(token), undefined) }),
        [stage],
      ).run(new AbortController().signal);
      expect(resumed.ok).toBe(true);
      expect(starts[0]).toBe("3");
      expect(seen).toHaveLength(10);
      expect(new Set(seen).size).toBe(10);
    });

    it("keeps the cursor behind an uncommitted batch when the commit fails (guards skipping lost work)", async () => {
      const h = await make();
      const failing: CursorRepository = {
        get: h.cursors.get,
        set: async () => err(new StorageError()),
      };
      const r = await build({ ...h, cursors: failing }, batchesSource(3, 2), [pass("p")]).run(
        new AbortController().signal,
      );
      expect(r.ok).toBe(false);
      expect(unwrap(await h.cursors.get(ws, account, "sync"))).toBeNull();
    });

    it("parks a failing item in the queue and keeps going, then retries and dead-letters it (guards a poison item stalling the run)", async () => {
      const h = await make();
      const done: string[] = [];
      const picky: Stage<string, string> = {
        name: "picky",
        concurrency: 1,
        process: async (item) => (item === "i1" ? err(new Offline()) : ok(item)),
      };
      const pipeline = build(h, batchesSource(2, 2), [picky, pass("end", (i) => done.push(i))]);
      const report = unwrap(await pipeline.run(new AbortController().signal));
      expect(report).toMatchObject({ status: "completed", processed: 3, deferred: 1 });
      // Batches run concurrently (maxInFlightBatches), so the order items reach the last stage across
      // batches depends on how fast the queue parks i1. Only the cursor commit order is promised.
      expect([...done].sort()).toEqual(["i0", "i2", "i3"]);

      const signal = new AbortController().signal;
      expect(unwrap(await pipeline.drainRetries(signal))).toMatchObject({ retried: 1 });
      expect(await h.deadLetters()).toHaveLength(0);
      h.clock.advance(1_000);
      expect(unwrap(await pipeline.drainRetries(signal))).toMatchObject({ deadLettered: 1 });
      expect(await h.deadLetters()).toHaveLength(1);
    });

    it("finishes a deferred item through the remaining stages once it recovers (guards retries that never complete)", async () => {
      const h = await make();
      const done: string[] = [];
      let healthy = false;
      const flaky: Stage<string, string> = {
        name: "flaky",
        concurrency: 1,
        process: async (item) => (healthy ? ok(item) : err(new Offline())),
      };
      const pipeline = build(h, batchesSource(1, 1), [flaky, pass("end", (i) => done.push(i))]);
      await pipeline.run(new AbortController().signal);
      expect(done).toEqual([]);
      healthy = true;
      expect(unwrap(await pipeline.drainRetries(new AbortController().signal))).toMatchObject({
        succeeded: 1,
      });
      expect(done).toEqual(["i0"]);
    });
  });
}
