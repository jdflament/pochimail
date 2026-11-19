import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult } from "@pochimail/kernel/common";
import type { ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { Job, JobQueue } from "./job-queue.ts";

export interface RetryPolicy {
  /** Attempts (claims) allowed before the job is dead-lettered. */
  readonly maxAttempts: number;
  /** Ceiling of the first retry delay. */
  readonly baseDelayMs: number;
  /** Cap on any delay ceiling. */
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 300_000,
};

/**
 * Delay before retry after the `attempt`-th failed attempt (1-based): "equal jitter" over an
 * exponential ceiling. With `ceiling = min(maxDelayMs, baseDelayMs * 2^(attempt-1))` the result
 * lies in `[ceiling / 2, ceiling]` for `random` in `[0, 1]`. `random` is injected (no hidden
 * `Math.random`), so tests are deterministic.
 */
export function retryDelayMs(attempt: number, policy: RetryPolicy, random: () => number): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 52);
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(ceiling / 2 + (ceiling / 2) * r);
}

export interface NackDeps {
  readonly clock: Clock;
  readonly random: () => number;
  readonly policy?: RetryPolicy;
}

/**
 * Negative-acknowledges a claimed job: retries with exponential backoff + jitter, or
 * dead-letters it once `job.attempts` reached `policy.maxAttempts`.
 */
export function nackJob(
  queue: JobQueue,
  job: Job,
  code: ErrorCode,
  deps: NackDeps,
): AsyncResult<"retry" | "dead-letter", StorageError> {
  const policy = deps.policy ?? DEFAULT_RETRY_POLICY;
  const exhausted = job.attempts >= policy.maxAttempts;
  const retryAt = exhausted
    ? undefined
    : new Date(
        deps.clock.now().getTime() + retryDelayMs(job.attempts, policy, deps.random),
      ).toISOString();
  return queue
    .fail(job.id, code, retryAt, job.lease)
    .then((r) => (r.ok ? { ok: true, value: exhausted ? "dead-letter" : "retry" } : r));
}
