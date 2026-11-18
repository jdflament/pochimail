import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createOptimisticActionRegistry } from "./optimistic.ts";

describe("optimistic action registry", () => {
  it("removes a query when rolling back an optimistic update that had no previous cache entry", () => {
    const queryClient = new QueryClient();
    const registry = createOptimisticActionRegistry();
    const key = ["settings"] as const;

    registry.start({
      actionId: "a1",
      queryKey: key,
      queryClient,
      optimistic: () => ({ autopilot: true, notifications: true }),
    });
    expect(queryClient.getQueryData(key)).toEqual({ autopilot: true, notifications: true });

    registry.fail("a1");
    expect(queryClient.getQueryData(key)).toBeUndefined();
    expect(queryClient.getQueryState(key)).toBeUndefined();
  });

  it("rolls back a pending optimistic update when its timeout expires", () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const registry = createOptimisticActionRegistry();
      const key = ["settings"] as const;
      queryClient.setQueryData(key, { autopilot: false, notifications: true });

      registry.start({
        actionId: "a1",
        queryKey: key,
        queryClient,
        optimistic: () => ({ autopilot: true, notifications: true }),
        timeoutMs: 1000,
      });
      expect(queryClient.getQueryData(key)).toEqual({ autopilot: true, notifications: true });

      vi.advanceTimersByTime(1000);
      expect(queryClient.getQueryData(key)).toEqual({ autopilot: false, notifications: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
