import { useEffect } from "react";
import type { RpcClient } from "../../../shared/ipc/client.ts";
import { useOptimisticRegistry } from "./optimistic-context.tsx";
import { subscribeAppEvents } from "./query/worker-events.ts";

/** Keeps the global app.events subscription active so optimistic mutations reconcile without polling. */
export function AppEventsBridge({ client }: { client: RpcClient }) {
  const registry = useOptimisticRegistry();
  useEffect(() => subscribeAppEvents(client, registry), [client, registry]);
  return null;
}
