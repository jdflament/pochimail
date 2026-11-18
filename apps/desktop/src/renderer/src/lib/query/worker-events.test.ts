import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createRpcClient } from "../../../../shared/ipc/client.ts";
import { serveRpc } from "../../../../shared/ipc/server.ts";
import { fromDomPort } from "../../../../shared/ipc/transport.ts";
import { queryKeys } from "./keys.ts";
import { createOptimisticActionRegistry } from "./optimistic.ts";
import { subscribeAppEvents, subscribeScanProgress } from "./worker-events.ts";

const createFakeIpc = () => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  return {
    client: createRpcClient(fromDomPort(port1)),
    server: fromDomPort(port2),
    close: () => {
      port1.close();
      port2.close();
    },
  };
};

describe("query-from-events", () => {
  it("updates a cached scan progress query from a subscription event without a refetch", async () => {
    let emitProgress: (event: {
      accountId: string;
      phase: "listing" | "fetching" | "classifying" | "done";
      processed: number;
      total: number;
    }) => void = () => {};
    const ipc = createFakeIpc();
    serveRpc(ipc.server, {
      procedures: {},
      subscriptions: {
        "scan.progress": (_input, emit) => {
          emitProgress = emit;
          return undefined;
        },
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const refetch = vi.fn(async () => ({
      accountId: "acc-1",
      phase: "listing",
      processed: 0,
      total: 0,
    }));
    queryClient.setQueryDefaults(queryKeys.scanProgress("acc-1"), { queryFn: refetch });

    const unsubscribe = subscribeScanProgress(ipc.client, queryClient, "acc-1");
    await vi.waitFor(() => expect(emitProgress).toBeTypeOf("function"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    emitProgress({ accountId: "acc-1", phase: "fetching", processed: 12, total: 100 });
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(queryKeys.scanProgress("acc-1"))).toEqual({
        accountId: "acc-1",
        phase: "fetching",
        processed: 12,
        total: 100,
      }),
    );

    // Guards: a subscription-driven update must not trigger a query refetch (ADR 0002 "no polling").
    expect(refetch).not.toHaveBeenCalled();

    unsubscribe();
    ipc.close();
    queryClient.clear();
  });

  it("rolls back an optimistic mutation when ActionFailed arrives for its action", async () => {
    let emitEvent: (
      event:
        | { type: "ActionApplied"; actionId: string }
        | {
            type: "ActionFailed";
            actionId: string;
            reason: "not-found" | "conflict" | "provider-error" | "cancelled" | "unknown";
          },
    ) => void = () => {};
    const ipc = createFakeIpc();
    serveRpc(ipc.server, {
      procedures: {},
      subscriptions: {
        "app.events": (_input, emit) => {
          emitEvent = emit;
          return undefined;
        },
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const registry = createOptimisticActionRegistry();
    const unsubscribe = subscribeAppEvents(ipc.client, registry);
    await vi.waitFor(() => expect(emitEvent).toBeTypeOf("function"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const key = ["settings"] as const;
    queryClient.setQueryData(key, { autopilot: false, notifications: true });
    registry.start({
      actionId: "action-1",
      queryKey: key,
      queryClient,
      optimistic: (current: { autopilot: boolean; notifications: boolean } | undefined) => ({
        autopilot: true,
        notifications: current?.notifications ?? true,
      }),
    });
    expect(queryClient.getQueryData(key)).toEqual({ autopilot: true, notifications: true });

    emitEvent({ type: "ActionFailed", actionId: "action-1", reason: "provider-error" });
    await vi.waitFor(() =>
      expect(queryClient.getQueryData(key)).toEqual({ autopilot: false, notifications: true }),
    );

    unsubscribe();
    ipc.close();
    queryClient.clear();
  });
});
