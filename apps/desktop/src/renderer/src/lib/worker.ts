import { createDeviceNameClient } from "../../../shared/ipc/device-name.ts";
import { createEchoClient, type Transport } from "../../../shared/ipc/echo.ts";

export type WorkerClient = ReturnType<typeof createEchoClient> &
  ReturnType<typeof createDeviceNameClient>;

/** Asks the preload for the worker MessagePort and wraps it in the typed RPC clients. */
export const connectWorker = (): Promise<WorkerClient> =>
  new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data !== "pochimail:worker-port") return;
      const port = event.ports[0];
      if (port === undefined) return;
      window.removeEventListener("message", onMessage);
      const transport: Transport = {
        post: (message) => port.postMessage(message),
        onMessage: (handler) =>
          port.addEventListener("message", (portEvent) => handler(portEvent.data)),
      };
      port.start();
      resolve(Object.assign(createEchoClient(transport), createDeviceNameClient(transport)));
    };
    window.addEventListener("message", onMessage);
    window.pochimail.requestWorkerPort();
  });
