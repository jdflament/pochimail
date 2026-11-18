import { toast } from "@pochimail/ui/components/sonner";
import { t } from "@pochimail/ui/i18n/format.ts";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { RpcClient } from "../../../shared/ipc/client.ts";
import { useOptimisticRegistry } from "./optimistic-context.tsx";
import { subscribeAppEvents } from "./query/worker-events.ts";

/** Keeps the global app.events subscription active so optimistic mutations reconcile without polling. */
export function AppEventsBridge({ client }: { client: RpcClient }) {
  const registry = useOptimisticRegistry();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeAppEvents(
        client,
        registry,
        () => toast.error(t("scan.failed")),
        () => void queryClient.invalidateQueries({ queryKey: ["mailbox"] }),
      ),
    [client, registry, queryClient],
  );
  return null;
}
