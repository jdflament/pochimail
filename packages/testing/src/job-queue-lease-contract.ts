import type { ErrorCode } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import { nackJob, type RetryPolicy } from "@pochimail/core/jobs/retry";
import type { Job, JobQueue } from "@pochimail/core/ports/job-queue";
import { unwrap } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";
import type { FakeClock } from "./fake-clock.ts";

export interface JobQueueContractHarness {
  readonly queue: JobQueue;
  /** The clock the queue reads for leases and `runAt`. */
  readonly clock: FakeClock;
  /** Lease length the queue was built with. */
  readonly leaseMs: number;
  deadLetters(): Promise<readonly { jobId: string; code: ErrorCode }[]>;
}

const ws = "ws-queue" as WorkspaceId;
const never = new AbortController().signal;
const request = (key: string) => ({ type: "sync", payload: { cursor: key }, idempotencyKey: key });
const policy: RetryPolicy = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 60_000 };

/**
 * Contract for any leased, persistent `JobQueue` (in-memory, SQLite). Exported so M2 adapters
 * reuse it unchanged. `make` returns a fresh, empty queue wired to a `FakeClock`.
 */
export function runJobQueueContract(
  make: () => JobQueueContractHarness | Promise<JobQueueContractHarness>,
): void {
  describe("JobQueue contract (leases, retries, dead letters)", () => {
    const claim = async (q: JobQueue): Promise<Job | null> =>
      unwrap(await q.claim(["sync"], never));

    it("redelivers a job to another consumer when its lease expires (guards a crashed worker stranding a job)", async () => {
      const { queue, clock, leaseMs } = await make();
      await queue.enqueue(ws, request("k"));
      const first = await claim(queue);
      expect(first?.attempts).toBe(1);
      expect(await claim(queue)).toBeNull();
      clock.advance(leaseMs);
      const second = await claim(queue);
      expect(second?.id).toBe(first?.id);
      expect(second?.attempts).toBe(2);
      expect(second?.lease).not.toBe(first?.lease);
    });

    it("keeps the job invisible until the lease actually expires (guards two consumers running one job)", async () => {
      const { queue, clock, leaseMs } = await make();
      await queue.enqueue(ws, request("k"));
      await claim(queue);
      clock.advance(leaseMs - 1);
      expect(await claim(queue)).toBeNull();
    });

    it("refuses the ack of a lease that expired and was redelivered (guards a slow consumer completing another's job)", async () => {
      const { queue, clock, leaseMs } = await make();
      await queue.enqueue(ws, request("k"));
      const slow = await claim(queue);
      clock.advance(leaseMs);
      const fast = await claim(queue);
      const late = await queue.complete(slow?.id ?? "", slow?.lease);
      expect(late.ok).toBe(false);
      expect((await queue.complete(fast?.id ?? "", fast?.lease)).ok).toBe(true);
      clock.advance(leaseMs * 10);
      expect(await claim(queue)).toBeNull();
    });

    it("never redelivers an acknowledged job (guards finished work running twice)", async () => {
      const { queue, clock, leaseMs } = await make();
      await queue.enqueue(ws, request("k"));
      const job = await claim(queue);
      expect((await queue.complete(job?.id ?? "", job?.lease)).ok).toBe(true);
      clock.advance(leaseMs * 10);
      expect(await claim(queue)).toBeNull();
    });

    it("enqueuing the same key twice yields one job (guards duplicate work after a relay retry)", async () => {
      const { queue } = await make();
      await queue.enqueue(ws, request("same"));
      await queue.enqueue(ws, request("same"));
      expect(await claim(queue)).not.toBeNull();
      expect(await claim(queue)).toBeNull();
    });

    it.each([
      ["minimum jitter", 0, 500],
      ["maximum jitter", 1, 1_000],
    ])(
      "retries after a nack exactly when the backoff passes with %s (guards instant or unbounded retries)",
      async (_name, random, delay) => {
        const { queue, clock } = await make();
        await queue.enqueue(ws, request("k"));
        const job = await claim(queue);
        const nacked = await nackJob(queue, job as Job, "provider.offline", {
          clock,
          random: () => random,
          policy,
        });
        expect(nacked).toEqual({ ok: true, value: "retry" });
        clock.advance(delay - 1);
        expect(await claim(queue)).toBeNull();
        clock.advance(1);
        expect((await claim(queue))?.attempts).toBe(2);
      },
    );

    it("dead-letters the job after max attempts and never offers it again (guards an endless retry loop)", async () => {
      const { queue, clock, deadLetters } = await make();
      await queue.enqueue(ws, request("poison"));
      const outcomes: string[] = [];
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
        clock.advance(policy.maxDelayMs);
        const job = await claim(queue);
        expect(job?.attempts).toBe(attempt);
        const r = await nackJob(queue, job as Job, "provider.offline", {
          clock,
          random: () => 0.5,
          policy,
        });
        outcomes.push(unwrap(r));
      }
      expect(outcomes).toEqual(["retry", "retry", "dead-letter"]);
      clock.advance(policy.maxDelayMs * 10);
      expect(await claim(queue)).toBeNull();
      expect(await deadLetters()).toMatchObject([{ code: "provider.offline" }]);
    });
  });
}
