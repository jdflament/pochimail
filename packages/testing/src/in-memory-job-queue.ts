import type { Clock } from "@pochimail/kernel/clock";
import { type ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "@pochimail/kernel/testing/faults";
import type { Job, JobQueue } from "@pochimail/pipeline/job-queue";

export interface DeadLetter {
  readonly job: Job;
  readonly code: ErrorCode;
}

export const DEFAULT_LEASE_MS = 30_000;

export interface InMemoryJobQueue extends JobQueue {
  readonly faults: Faults<StorageError>;
  /** Jobs waiting to be claimed (due or not), in enqueue order. */
  pending(): readonly Job[];
  deadLetters(): readonly DeadLetter[];
}

type Entry = {
  job: Job;
  state: "pending" | "claimed" | "done" | "dead";
  leaseExpiresAt: number;
};

/** Due-ness follows the injected clock, so tests advance time instead of sleeping. */
export function createInMemoryJobQueue(
  clock: Clock,
  options: { leaseMs?: number } = {},
): InMemoryJobQueue {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  let leases = 0;
  const entries: Entry[] = [];
  const keys = new Set<string>();
  const dead: DeadLetter[] = [];
  const faults = createFaults<StorageError>();
  let seq = 0;

  const due = (job: Job) =>
    job.runAt === undefined || Date.parse(job.runAt) <= clock.now().getTime();
  const runAt = (e: Entry) => (e.job.runAt ? Date.parse(e.job.runAt) : 0);
  /** A lease that ran out makes a claimed job claimable again (crashed consumer). */
  const claimable = (e: Entry) =>
    (e.state === "pending" && due(e.job)) ||
    (e.state === "claimed" && e.leaseExpiresAt <= clock.now().getTime());
  /**
   * The claimed job whose lease is still valid. With a `lease` token it must be the current
   * one, so a consumer whose lease expired and was redelivered cannot ack the new holder's work.
   */
  const held = (id: string, lease: string | undefined) => {
    const e = entries.find((x) => x.job.id === id);
    if (e?.state !== "claimed" || e.leaseExpiresAt <= clock.now().getTime()) return undefined;
    return lease === undefined || e.job.lease === lease ? e : undefined;
  };
  return {
    faults,
    pending: () => entries.filter((e) => e.state === "pending").map((e) => structuredClone(e.job)),
    deadLetters: () => structuredClone(dead),
    async enqueue(workspaceId: WorkspaceId, request) {
      const failure = faults.take();
      if (failure) return err(failure);
      const k = `${workspaceId}\u0000${request.idempotencyKey}`;
      if (keys.has(k)) return ok(undefined);
      keys.add(k);
      seq += 1;
      entries.push({
        state: "pending",
        leaseExpiresAt: 0,
        job: structuredClone({ ...request, id: `job-${seq}`, workspaceId, attempts: 0 }),
      });
      return ok(undefined);
    },
    async claim(types, signal) {
      const failure = faults.take();
      if (failure) return err(failure);
      if (signal.aborted) return ok(null);
      const next = entries
        .filter((e) => types.includes(e.job.type) && claimable(e))
        .sort(
          (a, b) => Math.max(runAt(a), a.leaseExpiresAt) - Math.max(runAt(b), b.leaseExpiresAt),
        )[0];
      if (!next) return ok(null);
      leases += 1;
      next.state = "claimed";
      next.leaseExpiresAt = clock.now().getTime() + leaseMs;
      next.job = { ...next.job, attempts: next.job.attempts + 1, lease: `lease-${leases}` };
      return ok(structuredClone(next.job));
    },
    async complete(jobId, lease) {
      const failure = faults.take();
      if (failure) return err(failure);
      const e = held(jobId, lease);
      if (!e) return err(new StorageError("Job lease is not held"));
      e.state = "done";
      return ok(undefined);
    },
    async fail(jobId, code, retryAt, lease) {
      const failure = faults.take();
      if (failure) return err(failure);
      const e = held(jobId, lease);
      if (!e) return err(new StorageError("Job lease is not held"));
      if (retryAt === undefined) {
        e.state = "dead";
        dead.push({ job: structuredClone(e.job), code });
      } else {
        e.state = "pending";
        e.job = { ...e.job, runAt: retryAt };
      }
      return ok(undefined);
    },
  };
}
