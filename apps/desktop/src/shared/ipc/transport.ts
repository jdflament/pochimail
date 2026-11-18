/** The smallest surface the RPC needs from a MessagePort, so it works with DOM ports, MessagePortMain and test doubles. */
export type Transport = {
  post: (message: unknown) => void;
  onMessage: (handler: (data: unknown) => void) => void;
  /** Fires when the other end (or this end) closes the port. */
  onClose: (handler: () => void) => void;
  close: () => void;
};

type CloseablePort = MessagePort & {
  addEventListener: MessagePort["addEventListener"];
  on?: (event: "close", listener: () => void) => void;
  __pochimailClosed?: boolean;
};

/** Adapts a DOM/Node `MessagePort` (renderer side, tests). The caller keeps ownership of `start()`. */
export const fromDomPort = (port: MessagePort): Transport => {
  const closeable = port as CloseablePort;
  let closed = closeable.__pochimailClosed === true;
  const markClosed = () => {
    closed = true;
    closeable.__pochimailClosed = true;
  };
  return {
    post: (message) => {
      if (closed) throw new Error("MessagePort closed");
      port.postMessage(message);
    },
    onMessage: (handler) => port.addEventListener("message", (event) => handler(event.data)),
    onClose: (handler) => {
      if (closed) {
        queueMicrotask(handler);
        return;
      }
      const fire = () => {
        if (closed) return;
        markClosed();
        handler();
      };
      port.addEventListener("close", fire);
      // Node worker_threads ports also emit close via EventEmitter; support both.
      closeable.on?.("close", fire);
    },
    close: () => {
      markClosed();
      port.close();
    },
  };
};
