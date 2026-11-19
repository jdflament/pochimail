import type { WorkspaceId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import type { JobQueue } from "@pochimail/pipeline/job-queue";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import type { FakeClock } from "./fake-clock.ts";

export interface JobQueueHarness {
  readonly queue: JobQueue;
  /** The clock the queue reads for `runAt`; the contract moves it forward. */
  readonly clock: FakeClock;
}

const ws = "ws-jobs" as WorkspaceId;
const req = (key: string, extra: { type?: string; runAt?: string; payload?: unknown } = {}) => ({
  type: extra.type ?? "sync",
  payload: extra.payload ?? { page: 1 },
  idempotencyKey: key,
  ...(extra.runAt ? { runAt: extra.runAt } : {}),
});
const never = new AbortController().signal;

export const jobQueueChecks: readonly Check<JobQueueHarness>[] = [
  check(
    "claim returns a due job with its payload intact (guards losing sync cursors across a restart)",
    async ({ queue }) => {
      await queue.enqueue(ws, req("k1", { payload: { cursor: "abc", n: 2 } }));
      const job = unwrap(await queue.claim(["sync"], never));
      expect(job).toMatchObject({
        workspaceId: ws,
        type: "sync",
        payload: { cursor: "abc", n: 2 },
        attempts: 1,
      });
    },
  ),
  check(
    "enqueuing the same key twice yields one job (guards duplicate work after a retry)",
    async ({ queue }) => {
      await queue.enqueue(ws, req("same"));
      await queue.enqueue(ws, req("same"));
      expect(unwrap(await queue.claim(["sync"], never))).not.toBeNull();
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
    },
  ),
  check(
    "a job is not claimable before its runAt (guards a backoff retry running immediately)",
    async ({ queue, clock }) => {
      const runAt = new Date(clock.now().getTime() + 60_000).toISOString();
      await queue.enqueue(ws, req("later", { runAt }));
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
      clock.advance(60_000);
      expect(unwrap(await queue.claim(["sync"], never))).not.toBeNull();
    },
  ),
  check(
    "claim only returns the requested types (guards a worker taking another worker's job)",
    async ({ queue }) => {
      await queue.enqueue(ws, req("c", { type: "classify" }));
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
      expect(unwrap(await queue.claim(["sync", "classify"], never))?.type).toBe("classify");
    },
  ),
  check(
    "a claimed job is not handed out again (guards two workers running one job)",
    async ({ queue }) => {
      await queue.enqueue(ws, req("once"));
      expect(unwrap(await queue.claim(["sync"], never))).not.toBeNull();
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
    },
  ),
  check("a completed job never comes back (guards finished work re-running)", async ({ queue }) => {
    await queue.enqueue(ws, req("done"));
    const job = unwrap(await queue.claim(["sync"], never));
    await queue.complete(job?.id ?? "", job?.lease);
    expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
  }),
  check(
    "fail with retryAt re-queues it later with the attempt counted (guards retries that forget attempts)",
    async ({ queue, clock }) => {
      await queue.enqueue(ws, req("retry"));
      const first = unwrap(await queue.claim(["sync"], never));
      const retryAt = new Date(clock.now().getTime() + 5_000).toISOString();
      await queue.fail(first?.id ?? "", "provider.offline", retryAt, first?.lease);
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
      clock.advance(5_000);
      const second = unwrap(await queue.claim(["sync"], never));
      expect(second?.id).toBe(first?.id);
      expect(second?.attempts).toBe(2);
    },
  ),
  check(
    "fail without retryAt dead-letters the job (guards an endless retry loop)",
    async ({ queue, clock }) => {
      await queue.enqueue(ws, req("dead"));
      const job = unwrap(await queue.claim(["sync"], never));
      await queue.fail(job?.id ?? "", "storage.failed", undefined, job?.lease);
      clock.advance(10 * 60_000);
      expect(unwrap(await queue.claim(["sync"], never))).toBeNull();
    },
  ),
  check(
    "claim resolves ok(null) when the signal aborts with nothing due (guards a worker that cannot shut down)",
    async ({ queue }) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);
      expect(unwrap(await queue.claim(["sync"], controller.signal))).toBeNull();
    },
  ),
];

/** Contract for any `JobQueue`. `make` returns a fresh, empty queue wired to a `FakeClock`. */
export function jobQueueContract(make: () => JobQueueHarness | Promise<JobQueueHarness>): void {
  registerContract("JobQueue contract", jobQueueChecks, make);
}
