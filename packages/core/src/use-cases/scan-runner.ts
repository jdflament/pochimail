import type { Account } from "../domain/account.ts";
import { InvalidStateError, NotFound, type StorageError } from "../errors.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { err, ok, type Result } from "../result.ts";
import type { RunScan } from "./run-scan.ts";

export type ScanJobStatus = "running" | "paused" | "completed" | "cancelled" | "failed";

interface Job {
  readonly id: string;
  readonly accountId: AccountId;
  status: ScanJobStatus;
  processed: number;
  stop: (() => void) | undefined;
}

export interface ScanRunnerDeps {
  readonly uow: UnitOfWork;
  readonly workspaceId: WorkspaceId;
  /** A new, unique job id. */
  readonly newJobId: () => string;
  /** The scan for one account; the composition root wires its provider and classifier. */
  readonly scanFor: (account: Account) => RunScan;
}

/** `AbortController` without a DOM: core has no such global. */
function createStop() {
  const listeners = new Set<() => void>();
  const signal: CancelSignal & { aborted: boolean } = {
    aborted: false,
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  };
  return {
    signal,
    abort: () => {
      if (signal.aborted) return;
      signal.aborted = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * Starts, pauses, resumes and cancels background scans, one running job per account. Starting while the
 * account's scan is already running returns that job. Pausing stops at a batch boundary; resuming continues
 * from the stored cursor, so nothing is read twice and nothing is skipped (brief §5.3).
 */
export class ScanRunner {
  private readonly jobs = new Map<string, Job>();

  constructor(private readonly deps: ScanRunnerDeps) {}

  async start(accountId: AccountId): AsyncResult<{ jobId: string }, StorageError | NotFound> {
    const existing = [...this.jobs.values()].find(
      (j) => j.accountId === accountId && (j.status === "running" || j.status === "paused"),
    );
    if (existing) {
      if (existing.status === "paused") this.drive(existing);
      return ok({ jobId: existing.id });
    }
    const account = await this.deps.uow.reads.accounts.get(this.deps.workspaceId, accountId);
    if (!account.ok) return account;
    const job: Job = {
      id: this.deps.newJobId(),
      accountId,
      status: "running",
      processed: 0,
      stop: undefined,
    };
    this.jobs.set(job.id, job);
    this.drive(job);
    return ok({ jobId: job.id });
  }

  pause(jobId: string): Result<void, NotFound> {
    const job = this.jobs.get(jobId);
    if (!job) return err(new NotFound("Scan"));
    if (job.status === "running") {
      job.status = "paused";
      job.stop?.();
    }
    return ok(undefined);
  }

  resume(jobId: string): Result<void, NotFound | InvalidStateError> {
    const job = this.jobs.get(jobId);
    if (!job) return err(new NotFound("Scan"));
    if (job.status === "running") return ok(undefined);
    if (job.status !== "paused") return err(new InvalidStateError(`scan is ${job.status}`));
    this.drive(job);
    return ok(undefined);
  }

  /** Stops the job for good; a new `start` begins again from the stored cursor. */
  cancel(jobId: string): Result<void, NotFound> {
    const job = this.jobs.get(jobId);
    if (!job) return err(new NotFound("Scan"));
    if (job.status === "running" || job.status === "paused") {
      job.status = "cancelled";
      job.stop?.();
    }
    return ok(undefined);
  }

  /** Resolves when no job is running; for orderly shutdown and tests. */
  async idle(): Promise<void> {
    await Promise.all(this.running);
  }

  private readonly running = new Set<Promise<void>>();

  private drive(job: Job): void {
    const stop = createStop();
    job.status = "running";
    job.stop = stop.abort;
    const run = (async () => {
      const found = await this.deps.uow.reads.accounts.get(this.deps.workspaceId, job.accountId);
      if (!found.ok) {
        job.status = "failed";
        return;
      }
      const outcome = await this.deps
        .scanFor(found.value)
        .execute({ jobId: job.id, processedBefore: job.processed }, stop.signal)
        .catch(() => undefined);
      if (!outcome?.ok) {
        if (job.status === "running") job.status = "failed";
        return;
      }
      job.processed = outcome.value.processed;
      if (outcome.value.status === "completed") job.status = "completed";
    })();
    this.running.add(run);
    void run.finally(() => this.running.delete(run));
  }
}
