import type { Clock } from "@pochimail/core/clock";
import { type ErrorCode, StorageError } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import type { Job, JobQueue } from "@pochimail/core/ports/job-queue";
import { err, ok } from "@pochimail/core/result";
import { createFaults, type Faults } from "./faults.ts";

export interface DeadLetter {
  readonly job: Job;
  readonly code: ErrorCode;
}

export interface InMemoryJobQueue extends JobQueue {
  readonly faults: Faults<StorageError>;
  /** Jobs waiting to be claimed (due or not), in enqueue order. */
  pending(): readonly Job[];
  deadLetters(): readonly DeadLetter[];
}

type Entry = { job: Job; state: "pending" | "claimed" | "done" | "dead" };

/** Due-ness follows the injected clock, so tests advance time instead of sleeping. */
export function createInMemoryJobQueue(clock: Clock): InMemoryJobQueue {
  const entries: Entry[] = [];
  const keys = new Set<string>();
  const dead: DeadLetter[] = [];
  const faults = createFaults<StorageError>();
  let seq = 0;

  const due = (job: Job) =>
    job.runAt === undefined || Date.parse(job.runAt) <= clock.now().getTime();
  const find = (id: string) => entries.find((e) => e.job.id === id);

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
        job: structuredClone({ ...request, id: `job-${seq}`, workspaceId, attempts: 0 }),
      });
      return ok(undefined);
    },
    async claim(types, signal) {
      const failure = faults.take();
      if (failure) return err(failure);
      if (signal.aborted) return ok(null);
      const next = entries
        .filter((e) => e.state === "pending" && types.includes(e.job.type) && due(e.job))
        .sort(
          (a, b) =>
            (a.job.runAt ? Date.parse(a.job.runAt) : 0) -
            (b.job.runAt ? Date.parse(b.job.runAt) : 0),
        )[0];
      if (!next) return ok(null);
      next.state = "claimed";
      next.job = { ...next.job, attempts: next.job.attempts + 1 };
      return ok(structuredClone(next.job));
    },
    async complete(jobId) {
      const failure = faults.take();
      if (failure) return err(failure);
      const e = find(jobId);
      if (e?.state !== "claimed") return err(new StorageError("Job is not claimed"));
      e.state = "done";
      return ok(undefined);
    },
    async fail(jobId, code, retryAt) {
      const failure = faults.take();
      if (failure) return err(failure);
      const e = find(jobId);
      if (e?.state !== "claimed") return err(new StorageError("Job is not claimed"));
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
