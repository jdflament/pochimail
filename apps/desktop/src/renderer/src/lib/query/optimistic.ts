import type { QueryClient } from "@tanstack/react-query";

type Pending = {
  rollback: () => void;
  timer: ReturnType<typeof setTimeout>;
};

export type OptimisticActionRegistry = {
  /** Snapshots a query and applies an optimistic update. Call `reconcile` from app.events to settle it. */
  start: <T>(options: {
    actionId: string;
    queryKey: readonly unknown[];
    queryClient: QueryClient;
    optimistic: (current: T | undefined) => T;
    timeoutMs?: number;
  }) => void;
  apply: (actionId: string) => void;
  fail: (actionId: string) => void;
  failAll: () => void;
  clear: () => void;
  dispose: () => void;
};

const DEFAULT_TIMEOUT_MS = 30_000;

/** Tracks in-flight optimistic updates so ActionApplied/ActionFailed can confirm or roll them back (ADR 0002). */
export const createOptimisticActionRegistry = (): OptimisticActionRegistry => {
  const pending = new Map<string, Pending>();

  const rollbackEntry = (actionId: string): void => {
    const entry = pending.get(actionId);
    if (entry === undefined) return;
    pending.delete(actionId);
    clearTimeout(entry.timer);
    entry.rollback();
  };

  return {
    start: ({ actionId, queryKey, queryClient, optimistic, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
      // If retried, roll back the previous optimistic state first.
      rollbackEntry(actionId);
      const hadPrevious = queryClient.getQueryData(queryKey) !== undefined;
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current: unknown) => optimistic(current as never));
      const timer = setTimeout(() => rollbackEntry(actionId), timeoutMs);
      pending.set(actionId, {
        timer,
        rollback: () => {
          if (hadPrevious) queryClient.setQueryData(queryKey, previous);
          else queryClient.removeQueries({ queryKey, exact: true });
        },
      });
    },
    apply: (actionId) => {
      const entry = pending.get(actionId);
      if (entry === undefined) return;
      pending.delete(actionId);
      clearTimeout(entry.timer);
    },
    fail: rollbackEntry,
    failAll: () => {
      for (const actionId of [...pending.keys()]) rollbackEntry(actionId);
    },
    clear: () => {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
    dispose: () => {
      for (const actionId of [...pending.keys()]) rollbackEntry(actionId);
    },
  };
};
