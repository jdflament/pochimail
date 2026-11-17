import type { Clock } from "@pochimail/core/clock";
import { type ErrorCode, StorageError } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import type { Job, JobQueue } from "@pochimail/core/ports/job-queue";
import { err, ok } from "@pochimail/core/result";

export const DEFAULT_LEASE_MS = 30_000;

export interface DeadLetterRecord {
  readonly jobId: string;
  readonly code: ErrorCode;
  readonly attempts: number;
}

export interface LeasedJobQueue extends JobQueue {
  deadLetters(): readonly DeadLetterRecord[];
}

type Entry = {
  job: Job;
  state: "pending" | "leased" | "done" | "dead";
  leaseExpiresAt: number;
};

/** In-memory `JobQueue` with leases. All time comes from `clock`: tests advance it, nothing sleeps. */
export function createLeasedJobQueue(
  clock: Clock,
  options: { leaseMs?: number } = {},
): LeasedJobQueue {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const entries: Entry[] = [];
  const keys = new Set<string>();
  const dead: DeadLetterRecord[] = [];
  let seq = 0;
  let leases = 0;

  const now = () => clock.now().getTime();
  const runAt = (e: Entry) => (e.job.runAt === undefined ? 0 : Date.parse(e.job.runAt));
  const claimable = (e: Entry) =>
    (e.state === "pending" && runAt(e) <= now()) ||
    (e.state === "leased" && e.leaseExpiresAt <= now());
  /** The holder of the current, unexpired lease; anyone else is refused. */
  const held = (jobId: string, lease: string | undefined) => {
    const e = entries.find((x) => x.job.id === jobId);
    const ok = e?.state === "leased" && e.leaseExpiresAt > now() && e.job.lease === lease;
    return ok ? e : undefined;
  };

  return {
    deadLetters: () => structuredClone(dead),
    async enqueue(workspaceId: WorkspaceId, request) {
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
      if (signal.aborted) return ok(null);
      const next = entries
        .filter((e) => types.includes(e.job.type) && claimable(e))
        .sort(
          (a, b) => Math.max(runAt(a), a.leaseExpiresAt) - Math.max(runAt(b), b.leaseExpiresAt),
        )[0];
      if (!next) return ok(null);
      leases += 1;
      next.state = "leased";
      next.leaseExpiresAt = now() + leaseMs;
      next.job = { ...next.job, attempts: next.job.attempts + 1, lease: `lease-${leases}` };
      return ok(structuredClone(next.job));
    },
    async complete(jobId, lease) {
      const e = held(jobId, lease);
      if (!e) return err(new StorageError("Job lease is not held"));
      e.state = "done";
      return ok(undefined);
    },
    async fail(jobId, code, retryAt, lease) {
      const e = held(jobId, lease);
      if (!e) return err(new StorageError("Job lease is not held"));
      if (retryAt === undefined) {
        e.state = "dead";
        dead.push({ jobId, code, attempts: e.job.attempts });
      } else {
        e.state = "pending";
        e.job = { ...e.job, runAt: retryAt };
      }
      return ok(undefined);
    },
  };
}
