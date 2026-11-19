import { createRpcClient, type RpcClient } from "#shared/ipc/client.ts";
import { fromDomPort } from "#shared/ipc/transport.ts";

let connection: Promise<RpcClient> | undefined;

/**
 * Asks the preload for the worker MessagePort and wraps it in the typed RPC client. The preload hands the port over once,
 * so this is idempotent: every caller (StrictMode double effects, remounts) gets the same client and a port never has two.
 */
export const connectWorker = (): Promise<RpcClient> => {
  connection ??= new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data !== "pochimail:worker-port") return;
      const port = event.ports[0];
      if (port === undefined) return;
      window.removeEventListener("message", onMessage);
      port.start();
      resolve(createRpcClient(fromDomPort(port)));
    };
    window.addEventListener("message", onMessage);
    window.pochimail.requestWorkerPort();
  });
  return connection;
};
