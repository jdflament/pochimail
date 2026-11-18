import { toast } from "@pochimail/ui/components/sonner";
import { t } from "@pochimail/ui/i18n/format.ts";
import { useEffect } from "react";
import type { RpcClient } from "../../../shared/ipc/client.ts";
import { useOptimisticRegistry } from "./optimistic-context.tsx";
import { subscribeAppEvents } from "./query/worker-events.ts";

/** Keeps the global app.events subscription active so optimistic mutations reconcile without polling. */
export function AppEventsBridge({ client }: { client: RpcClient }) {
  const registry = useOptimisticRegistry();
  useEffect(
    () => subscribeAppEvents(client, registry, () => toast.error(t("scan.failed"))),
    [client, registry],
  );
  return null;
}
