import { createEchoClient, type Transport } from "../../../shared/ipc/echo.ts";

/** Asks the preload for the worker MessagePort and wraps it in the typed echo client. */
export const connectWorker = (): Promise<ReturnType<typeof createEchoClient>> =>
  new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data !== "pochimail:worker-port") return;
      const port = event.ports[0];
      if (port === undefined) return;
      window.removeEventListener("message", onMessage);
      const transport: Transport = {
        post: (message) => port.postMessage(message),
        onMessage: (handler) => port.addEventListener("message", (portEvent) => handler(portEvent.data)),
      };
      port.start();
      resolve(createEchoClient(transport));
    };
    window.addEventListener("message", onMessage);
    window.pochimail.requestWorkerPort();
  });
