type Port = { close: () => void };
type Parent<P extends Port> = {
  on: (event: "message", listener: (event: { data?: unknown; ports: P[] }) => void) => void;
};

/** Every renderer load sends a fresh port. Serve the newest and close the previous one, so a reload never leaves a dead connection. */
export const acceptPorts = <P extends Port>(parent: Parent<P>, serve: (port: P) => void): void => {
  let current: P | undefined;
  parent.on("message", (event) => {
    // Only renderer ports: the secrets port arrives in a separate "start" message and must never be served to the page.
    if ((event.data as { type?: unknown } | null | undefined)?.type !== "port") return;
    const port = event.ports[0];
    if (port === undefined) return;
    current?.close();
    current = port;
    serve(port);
  });
};
