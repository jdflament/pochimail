import { randomUUID } from "node:crypto";
import type { Clock } from "@pochimail/kernel/clock";
import { ERROR_CODES, type ErrorCode, StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { workspaceIdSchema } from "@pochimail/kernel/schemas";
import type { Job, JobQueue } from "@pochimail/pipeline/job-queue";
import { z } from "zod";
import { exclusiveResult, type Storage } from "./open-storage.ts";
import { accountIdOf, guardPayload } from "./payload-guard.ts";

export const DEFAULT_LEASE_MS = 30_000;

const jobRow = z.object({
  id: z.string(),
  workspace_id: workspaceIdSchema,
  type: z.string(),
  payload: z.string(),
  idempotency_key: z.string(),
  run_at: z.string().nullable(),
  attempts: z.number().int(),
  lease: z.string().nullable(),
});

export interface SqliteJobQueue extends JobQueue {
  /** Dead-lettered jobs with the error code that sent them there (never a message or payload). */
  deadLetters(): readonly { jobId: string; code: ErrorCode }[];
}

const deadRow = z.object({ id: z.string(), error_code: z.enum(ERROR_CODES) });

/**
 * Persistent, leased `JobQueue` (ADR 0003), at-least-once. Due-ness and lease expiry follow the
 * injected clock. All statements go through `storage.exclusive`, so they never interleave with an
 * open `UnitOfWork` transaction; do not call the queue from inside `UnitOfWork.run`.
 * `claim` answers immediately: `ok(null)` when nothing is due or the signal already aborted.
 */
export function createSqliteJobQueue(
  storage: Storage,
  clock: Clock,
  options: { leaseMs?: number } = {},
): SqliteJobQueue {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const db = storage.writer;
  const failure = (message: string, cause: unknown) => err(new StorageError(message, { cause }));

  return {
    deadLetters: () =>
      db
        .prepare("SELECT id, error_code FROM job WHERE state = 'dead' ORDER BY seq")
        .all()
        .map((row) => {
          const r = deadRow.parse(row);
          return { jobId: r.id, code: r.error_code };
        }),

    enqueue: (workspaceId, request) =>
      exclusiveResult(storage, async () => {
        const guarded = guardPayload(request.payload);
        if (!guarded.ok) return guarded;
        try {
          db.prepare(
            `INSERT OR IGNORE INTO job (id, workspace_id, type, payload, idempotency_key, run_at, run_at_ms, account_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            randomUUID(),
            workspaceId,
            request.type,
            guarded.value,
            request.idempotencyKey,
            request.runAt ?? null,
            request.runAt === undefined ? 0 : Date.parse(request.runAt),
            accountIdOf(request.payload),
          );
          return ok(undefined);
        } catch (cause) {
          return failure("Could not enqueue the job", cause);
        }
      }),

    claim: (types, signal) =>
      exclusiveResult(storage, async () => {
        if (signal.aborted || types.length === 0) return ok(null);
        try {
          const now = clock.now().getTime();
          const lease = randomUUID();
          const marks = types.map(() => "?").join(", ");
          // A claimed job whose lease ran out is claimable again: a crashed worker strands nothing.
          const row = db.transaction(() => {
            const next = db
              .prepare(
                `SELECT id FROM job
                 WHERE type IN (${marks})
                   AND ((state = 'pending' AND run_at_ms <= ?) OR (state = 'claimed' AND lease_expires_ms <= ?))
                 ORDER BY max(run_at_ms, lease_expires_ms), seq
                 LIMIT 1`,
              )
              .get(...types, now, now) as { id: string } | undefined;
            if (next === undefined) return undefined;
            return db
              .prepare(
                `UPDATE job SET state = 'claimed', attempts = attempts + 1, lease = ?, lease_expires_ms = ?
                 WHERE id = ?
                 RETURNING id, workspace_id, type, payload, idempotency_key, run_at, attempts, lease`,
              )
              .get(lease, now + leaseMs, next.id);
          })();
          if (row === undefined) return ok(null);
          const r = jobRow.parse(row);
          const job: Job = {
            id: r.id,
            workspaceId: r.workspace_id,
            type: r.type,
            payload: JSON.parse(r.payload),
            idempotencyKey: r.idempotency_key,
            ...(r.run_at === null ? {} : { runAt: r.run_at }),
            attempts: r.attempts,
            ...(r.lease === null ? {} : { lease: r.lease }),
          };
          return ok(job);
        } catch (cause) {
          return failure("Could not claim a job", cause);
        }
      }),

    complete: (jobId, lease) =>
      exclusiveResult(storage, async () => {
        if (lease === undefined)
          return err(new StorageError("Job lease is required to acknowledge"));
        try {
          const changed = db
            .prepare(
              `UPDATE job SET state = 'done', finished_ms = ?, lease = NULL
               WHERE id = ? AND state = 'claimed' AND lease_expires_ms > ? AND lease = ?`,
            )
            .run(clock.now().getTime(), jobId, clock.now().getTime(), lease).changes;
          return changed === 1 ? ok(undefined) : err(new StorageError("Job lease is not held"));
        } catch (cause) {
          return failure("Could not complete the job", cause);
        }
      }),

    fail: (jobId, code, retryAt, lease) =>
      exclusiveResult(storage, async () => {
        if (lease === undefined)
          return err(new StorageError("Job lease is required to acknowledge"));
        try {
          const held = `id = ? AND state = 'claimed' AND lease_expires_ms > ? AND lease = ?`;
          const args = [jobId, clock.now().getTime(), lease] as const;
          const changed =
            retryAt === undefined
              ? db
                  .prepare(
                    `UPDATE job SET state = 'dead', finished_ms = ?, lease = NULL, error_code = ? WHERE ${held}`,
                  )
                  .run(clock.now().getTime(), code, ...args).changes
              : db
                  .prepare(
                    `UPDATE job SET state = 'pending', lease = NULL, run_at = ?, run_at_ms = ?, error_code = ? WHERE ${held}`,
                  )
                  .run(retryAt, Date.parse(retryAt), code, ...args).changes;
          return changed === 1 ? ok(undefined) : err(new StorageError("Job lease is not held"));
        } catch (cause) {
          return failure("Could not fail the job", cause);
        }
      }),
  };
}
