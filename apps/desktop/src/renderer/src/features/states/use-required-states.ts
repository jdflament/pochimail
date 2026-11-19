import { useEffect, useReducer } from "react";
import type { RpcClient } from "#shared/ipc/client.ts";
import {
  noRequiredStates,
  type RequiredStateEvent,
  reduceRequiredStates,
} from "./required-state-reducer.ts";

/** Required states derived from the worker's `app.events` stream (already zod-parsed by the client). */
export function useRequiredStates(client: Pick<RpcClient, "subscribe">) {
  const [states, dispatch] = useReducer(reduceRequiredStates, noRequiredStates);
  useEffect(() => {
    try {
      return client.subscribe("app.events", undefined, (event) => dispatch(event));
    } catch {
      return undefined;
    }
  }, [client]);
  return [states, dispatch as (event: RequiredStateEvent) => void] as const;
}
