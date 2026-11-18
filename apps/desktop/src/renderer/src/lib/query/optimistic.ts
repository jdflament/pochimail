import type { QueryClient } from "@tanstack/react-query";

type Pending = {
  rollback: () => void;
};

export type OptimisticActionRegistry = {
  /** Snapshots a query and applies an optimistic update. Call `reconcile` from app.events to settle it. */
  start: <T>(options: {
    actionId: string;
    queryKey: readonly unknown[];
    queryClient: QueryClient;
    optimistic: (current: T | undefined) => T;
  }) => void;
  apply: (actionId: string) => void;
  fail: (actionId: string) => void;
  clear: () => void;
};

/** Tracks in-flight optimistic updates so ActionApplied/ActionFailed can confirm or roll them back (ADR 0002). */
export const createOptimisticActionRegistry = (): OptimisticActionRegistry => {
  const pending = new Map<string, Pending>();
  return {
    start: ({ actionId, queryKey, queryClient, optimistic }) => {
      // If retried, drop the previous snapshot: the latest optimistic state is authoritative.
      pending.delete(actionId);
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current: unknown) => optimistic(current as never));
      pending.set(actionId, { rollback: () => queryClient.setQueryData(queryKey, previous) });
    },
    apply: (actionId) => {
      pending.delete(actionId);
    },
    fail: (actionId) => {
      const entry = pending.get(actionId);
      if (entry === undefined) return;
      pending.delete(actionId);
      entry.rollback();
    },
    clear: () => {
      pending.clear();
    },
  };
};
