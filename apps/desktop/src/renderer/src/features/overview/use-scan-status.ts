import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { EventOf } from "#shared/ipc/contract.ts";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";

/** At most one figure refresh per interval while events stream in; between refreshes the old figures stay on screen. */
const REFRESH_EVERY_MS = 1000;

type Progress = EventOf<"scan.progress">;

export type ScanStatus = {
  /** Whether the worker has a running or paused scan for these accounts. */
  readonly active: boolean;
  /** Read from the worker's jobs, so it survives leaving the screen and reloads. */
  readonly paused: boolean;
  /** 0 to 100; 0 while no total is known. */
  readonly percent: number;
  readonly processed: number;
  /** `null` while any account cannot say how many emails it has. */
  readonly total: number | null;
  pause(): void;
  resume(): void;
};

/**
 * The live scan state of the given accounts. Which jobs exist and whether they are paused comes from the worker (`scan.status`);
 * `scan.progress` events carry the numbers and, throttled, trigger a re-read of that state and of the Overview figures.
 */
export function useScanStatus(accountIds: readonly string[]): ScanStatus {
  const client = useWorkerClient();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Readonly<Record<string, Progress>>>({});
  const key = accountIds.join("\u0000");

  const jobs = useQuery({
    queryKey: queryKeys.scanStatus(accountIds),
    queryFn: () => client.call("scan.status", { accountIds: [...accountIds] }),
    enabled: accountIds.length > 0,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the stable identity of `accountIds`.
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer !== undefined) clearTimeout(timer);
      last = Date.now();
      timer = undefined;
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["scan", "status"] });
    };
    setProgress({});
    const stops = accountIds.map((accountId) =>
      client.subscribe(
        "scan.progress",
        { accountId },
        (event) => {
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

  const live = jobs.data ?? [];
  const events = Object.values(progress).filter((e) =>
    live.some((j) => j.accountId === e.accountId),
  );
  const processed =
    events.reduce((sum, e) => sum + e.processed, 0) +
    live
      .filter((j) => !events.some((e) => e.accountId === j.accountId))
      .reduce((sum, j) => sum + j.processed, 0);
  const known = events.length === live.length && events.every((e) => e.total !== null);
  const total =
    known && live.length > 0 ? events.reduce((sum, e) => sum + (e.total ?? 0), 0) : null;
  const percent = total === null || total === 0 ? 0 : Math.min(100, (processed / total) * 100);

  const act = (status: "running" | "paused", call: "scan.pause" | "scan.resume") => {
    void Promise.all(
      live.filter((j) => j.status === status).map((j) => client.call(call, { jobId: j.jobId })),
    ).finally(() => void queryClient.invalidateQueries({ queryKey: ["scan", "status"] }));
  };

  return {
    active: live.length > 0,
    paused: live.some((j) => j.status === "paused"),
    percent,
    processed,
    total,
    pause: () => act("running", "scan.pause"),
    resume: () => act("paused", "scan.resume"),
  };
}
