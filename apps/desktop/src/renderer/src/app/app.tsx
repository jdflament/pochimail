import { Toaster } from "@pochimail/ui/components/sonner";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useMemo } from "react";
import type { RpcClient } from "../../../shared/ipc/client.ts";
import { AppEventsBridge } from "../lib/app-events-bridge.tsx";
import { AppErrorBoundary } from "../lib/error-boundary.tsx";
import {
  createDefaultOptimisticRegistry,
  OptimisticActionProvider,
} from "../lib/optimistic-context.tsx";
import { createAppQueryClient } from "../lib/query/client.ts";
import { resolveWorkerClient } from "../lib/resolve-client.ts";
import { useWorkerClient, WorkerClientProvider } from "../lib/worker-context.tsx";
import { type AppRouter, createAppRouter } from "../router.tsx";

function AppShell({ router }: { router: AppRouter }) {
  const client = useWorkerClient();
  return (
    <>
      <AppEventsBridge client={client} />
      <RouterProvider router={router} />
    </>
  );
}

type WorkerClientValue = RpcClient | Promise<RpcClient>;

export type AppProps = {
  queryClient?: QueryClient;
  router?: AppRouter;
  /** Fake or pre-resolved worker client for tests. */
  workerClient?: WorkerClientValue;
  getWorkerClient?(): Promise<RpcClient>;
};

/**
 * Renderer application shell: providers, theme-aware root, query client, worker connection, event bridge and router.
 * Accepts injectable dependencies so behaviour can be tested through this public entry point with fake IPC.
 */
export function App(props: AppProps = {}) {
  const queryClient = useMemo(
    () => props.queryClient ?? createAppQueryClient(),
    [props.queryClient],
  );
  const registry = useMemo(() => createDefaultOptimisticRegistry(), []);
  const getWorkerClient = useMemo(() => {
    if (props.getWorkerClient !== undefined) return props.getWorkerClient;
    if (props.workerClient !== undefined) {
      const workerClient = props.workerClient;
      return () => resolveWorkerClient(workerClient);
    }
    return undefined;
  }, [props.getWorkerClient, props.workerClient]);
  const router = useMemo(() => {
    if (props.router !== undefined) return props.router;
    if (getWorkerClient === undefined) throw new Error("App requires a worker client");
    return createAppRouter({ getWorkerClient });
  }, [props.router, getWorkerClient]);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OptimisticActionProvider registry={registry}>
          <WorkerClientProvider client={props.workerClient}>
            <AppShell router={router} />
            <Toaster />
          </WorkerClientProvider>
        </OptimisticActionProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export { createAppQueryClient, createAppRouter };
