/** The smallest surface the RPC needs from a MessagePort, so it works with DOM ports, MessagePortMain and test doubles. */
export type Transport = {
  post: (message: unknown) => void;
  onMessage: (handler: (data: unknown) => void) => void;
  /** Fires when the other end (or this end) closes the port. */
  onClose: (handler: () => void) => void;
  close: () => void;
};

/** Adapts a DOM/Node `MessagePort` (renderer side, tests). The caller keeps ownership of `start()`. */
export const fromDomPort = (port: MessagePort): Transport => ({
  post: (message) => port.postMessage(message),
  onMessage: (handler) => port.addEventListener("message", (event) => handler(event.data)),
  onClose: (handler) => port.addEventListener("close", () => handler()),
  close: () => port.close(),
});
