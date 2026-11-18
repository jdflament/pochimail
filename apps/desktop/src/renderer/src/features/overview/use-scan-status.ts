import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { EventOf } from "../../../../shared/ipc/contract.ts";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";

/** At most one figure refresh per interval while events stream in; between refreshes the old figures stay on screen. */
const REFRESH_EVERY_MS = 1000;

type Progress = EventOf<"scan.progress">;

export type ScanStatus = {
  /** Whether any account reported progress and not every reporting account is done. */
  readonly active: boolean;
  /** 0 to 100; 0 while no total is known. */
  readonly percent: number;
  readonly processed: number;
  /** `null` while any account cannot say how many emails it has. */
  readonly total: number | null;
  readonly paused: boolean;
  pause(): void;
  resume(): void;
};

/**
 * Subscribes to `scan.progress` for the given accounts, keeps the latest event per account in the query cache and refreshes the
 * Overview figures (throttled) so numbers change in place. Pause and resume go through the scan jobs of those accounts.
 */
export function useScanStatus(accountIds: readonly string[]): ScanStatus {
  const client = useWorkerClient();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Readonly<Record<string, Progress>>>({});
  const [paused, setPaused] = useState(false);
  const key = accountIds.join("\u0000");

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the stable identity of `accountIds`.
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      last = Date.now();
      timer = undefined;
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    };
    setProgress({});
    const stops = accountIds.map((accountId) =>
      client.subscribe(
        "scan.progress",
        { accountId },
        (event) => {
          queryClient.setQueryData(queryKeys.scanProgress(accountId), event);
          setProgress((all) => ({ ...all, [accountId]: event }));
          const wait = REFRESH_EVERY_MS - (Date.now() - last);
          if (event.phase === "done" || wait <= 0) refresh();
          else timer ??= setTimeout(refresh, wait);
        },
        () => {},
      ),
    );
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const stop of stops) stop();
    };
  }, [client, queryClient, key]);

  const events = Object.values(progress);
  const active = events.length > 0 && events.some((e) => e.phase !== "done");
  const processed = events.reduce((sum, e) => sum + e.processed, 0);
  const total = events.some((e) => e.total === null)
    ? null
    : events.reduce((sum, e) => sum + (e.total ?? 0), 0);
  const percent = total === null || total === 0 ? 0 : Math.min(100, (processed / total) * 100);

  // Starting is idempotent: for a live job it returns that job's id, which is all pause and resume need.
  const forEachJob = useCallback(
    async (act: (jobId: string) => Promise<unknown>) => {
      for (const accountId of accountIds) {
        // A finished account has no live job; `scan.start` would begin a new scan.
        if (
          progress[accountId]?.phase !== "classifying" &&
          progress[accountId]?.phase !== "fetching" &&
          progress[accountId]?.phase !== "listing"
        )
          continue;
        const { jobId } = await client.call("scan.start", { accountId });
        await act(jobId);
      }
    },
    [client, accountIds, progress],
  );

  return {
    active,
    percent,
    processed,
    total,
    paused,
    pause: () => {
      setPaused(true);
      void forEachJob((jobId) => client.call("scan.pause", { jobId }));
    },
    // `scan.start` on a paused job already resumes it; the explicit call covers a job that is running again.
    resume: () => {
      setPaused(false);
      void forEachJob((jobId) => client.call("scan.resume", { jobId }));
    },
  };
}
