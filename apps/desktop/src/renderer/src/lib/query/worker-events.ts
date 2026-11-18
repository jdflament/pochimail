import type { RpcClient } from "../../../../shared/ipc/client.ts";
import type { EventOf } from "../../../../shared/ipc/contract.ts";
import type { OptimisticActionRegistry } from "./optimistic.ts";

const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 4000;

/** Subscribes to global app events and reconciles optimistic mutations on ActionApplied/ActionFailed. */
export const subscribeAppEvents = (
  client: RpcClient,
  registry: OptimisticActionRegistry,
): (() => void) => {
  let closed = false;
  let currentUnsubscribe: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let backoffMs = INITIAL_BACKOFF_MS;

  const connect = () => {
    if (closed) return;
    try {
      currentUnsubscribe = client.subscribe(
        "app.events",
        undefined,
        (event: EventOf<"app.events">) => {
          backoffMs = INITIAL_BACKOFF_MS;
          if (event.type === "ActionApplied") registry.apply(event.actionId);
          else if (event.type === "ActionFailed") registry.fail(event.actionId);
        },
        (error) => {
          console.error("[app.events]", error.code);
          registry.failAll();
          currentUnsubscribe = undefined;
          if (closed) return;
          retryTimer = setTimeout(connect, backoffMs);
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        },
      );
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "UNKNOWN";
      console.error("[app.events]", code);
      registry.failAll();
      currentUnsubscribe = undefined;
      if (closed) return;
      retryTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    currentUnsubscribe?.();
    currentUnsubscribe = undefined;
  };
};
