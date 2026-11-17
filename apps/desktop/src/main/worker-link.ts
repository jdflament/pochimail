import type { MessageChannelMain, MessagePortMain, WebContents } from "electron";

/** Renderer <-> worker traffic goes over a MessageChannel and never passes through a main handler (ADR 0002). */
export const linkWorkerOnEveryLoad = (
  contents: Pick<WebContents, "on" | "postMessage">,
  worker: { postMessage: (message: unknown, transfer: MessagePortMain[]) => void },
  createChannel: () => Pick<MessageChannelMain, "port1" | "port2">,
): void => {
  // A reload destroys the page's port, so each load gets its own channel; the worker closes the previous one.
  contents.on("did-finish-load", () => {
    const { port1, port2 } = createChannel();
    worker.postMessage({ type: "port" }, [port1]);
    contents.postMessage("worker-port", null, [port2]);
  });
};
