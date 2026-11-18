import type { QueryClient } from "@tanstack/react-query";
import type { RpcClient } from "../../../../shared/ipc/client.ts";
import type { EventOf } from "../../../../shared/ipc/contract.ts";
import { queryKeys } from "./keys.ts";
import type { OptimisticActionRegistry } from "./optimistic.ts";

/** Subscribes to global app events and reconciles optimistic mutations on ActionApplied/ActionFailed. */
export const subscribeAppEvents = (
  client: RpcClient,
  registry: OptimisticActionRegistry,
): (() => void) =>
  client.subscribe("app.events", undefined, (event: EventOf<"app.events">) => {
    if (event.type === "ActionApplied") registry.apply(event.actionId);
    else registry.fail(event.actionId);
  });

/**
 * Subscribes to scan progress for one account and writes each event into the query cache.
 * This updates the cache from the event stream without a refetch (ADR 0002).
 */
export const subscribeScanProgress = (
  client: RpcClient,
  queryClient: QueryClient,
  accountId: string,
): (() => void) =>
  client.subscribe("scan.progress", { accountId }, (event: EventOf<"scan.progress">) => {
    queryClient.setQueryData(queryKeys.scanProgress(accountId), event);
  });
