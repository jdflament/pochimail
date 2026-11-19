import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { RpcClient } from "../../../shared/ipc/client.ts";
import { connectWorker } from "./worker.ts";

type WorkerState =
  | { status: "connecting" }
  | { status: "ready"; client: RpcClient }
  | { status: "error"; error: unknown };

const WorkerClientContext = createContext<RpcClient | null>(null);

export const useWorkerClient = (): RpcClient => {
  const client = useContext(WorkerClientContext);
  if (client === null) throw new Error("worker client is not ready");
  return client;
};

export function WorkerClientProvider({
  children,
  client: provided,
}: {
  children: ReactNode;
  /** When supplied, skips the preload port handshake (useful for tests and stories with a fake IPC). */
  client?: RpcClient | Promise<RpcClient> | undefined;
}) {
  const t = useT();
  const [state, setState] = useState<WorkerState>({ status: "connecting" });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(provided === undefined ? connectWorker() : provided)
      .then((client) => {
        if (!cancelled) setState({ status: "ready", client });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [provided]);

  if (state.status === "connecting") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-foreground-tertiary">
        {t("shell.loading")}
      </div>
    );
  }
  if (state.status === "error") {
    throw state.error instanceof Error ? state.error : new Error("worker connection failed");
  }
  return (
    <WorkerClientContext.Provider value={state.client}>{children}</WorkerClientContext.Provider>
  );
}
