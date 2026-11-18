import type { Clock } from "@pochimail/core/clock";
import { StorageError } from "@pochimail/core/errors";
import { err, ok, type Result } from "@pochimail/core/result";
import { exclusiveResult, type Storage } from "./open-storage.ts";

export interface PruneReport {
  readonly outboxRows: number;
  readonly jobs: number;
}

/**
 * Deletes delivered outbox rows and done or dead-lettered jobs that finished more than
 * `retentionMs` ago, so nothing lingers (D11: store metadata, keep it short-lived). Pending and
 * claimed work is never touched. Scheduling is left to the worker (M4-02).
 */
export function pruneStorage(
  storage: Storage,
  clock: Clock,
  retentionMs: number,
): Promise<Result<PruneReport, StorageError>> {
  return exclusiveResult(storage, async () => {
    try {
      const cutoff = clock.now().getTime() - retentionMs;
      const outboxRows = storage.writer
        .prepare("DELETE FROM outbox WHERE delivered_at IS NOT NULL AND delivered_at < ?")
        .run(new Date(cutoff).toISOString()).changes;
      const jobs = storage.writer
        .prepare(
          "DELETE FROM job WHERE state IN ('done', 'dead') AND finished_ms IS NOT NULL AND finished_ms < ?",
        )
        .run(cutoff).changes;
      return ok({ outboxRows, jobs });
    } catch (cause) {
      return err(new StorageError("Could not prune storage", { cause }));
    }
  });
}
