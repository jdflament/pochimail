import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createEchoClient, serveEcho, type Transport } from "../shared/ipc/echo.ts";
import { acceptPorts } from "../worker/ports.ts";
import { linkWorkerOnEveryLoad } from "./worker-link.ts";

const asTransport = (port: MessagePort): Transport => ({
  post: (message) => port.postMessage(message),
  onMessage: (handler) => port.addEventListener("message", (event) => handler(event.data)),
});

// Guards: after a renderer reload (Cmd+R) the page must get a working worker port again, not stay stuck on "Starting…".
describe("worker connection across page loads", () => {
  it("gives every load a fresh port pair and a worker that serves the newest one", async () => {
    const loads = new EventEmitter();
    const toRenderer: MessagePort[] = [];
    const parent = new EventEmitter();

    // Main side: real linking code with Node MessageChannels standing in for MessageChannelMain.
    linkWorkerOnEveryLoad(
      {
        on: (event: string, listener: () => void) => loads.on(event, listener),
        postMessage: (_channel: string, _msg: unknown, ports: unknown[]) =>
          void toRenderer.push(ports[0] as MessagePort),
      } as never,
      {
        postMessage: (data: unknown, ports: unknown[]) =>
          void parent.emit("message", { data, ports }),
      },
      () => new MessageChannel() as never,
    );
    // Worker side: real port-accepting code serving echo.
    const workerPorts: MessagePort[] = [];
    acceptPorts(parent as never, (port: MessagePort) => {
      workerPorts.push(port);
      port.start();
      serveEcho(asTransport(port));
    });

    loads.emit("did-finish-load");
    loads.emit("did-finish-load"); // the reload

    expect(toRenderer).toHaveLength(2);
    const [firstPage, secondPage] = toRenderer as [MessagePort, MessagePort];
    secondPage.start();
    await expect(createEchoClient(asTransport(secondPage)).echo("after reload")).resolves.toBe(
      "after reload",
    );

    firstPage.start();
    await expect(createEchoClient(asTransport(firstPage), 50).echo("stale page")).rejects.toThrow(
      "worker did not answer",
    );
    firstPage.close();
    secondPage.close();
    for (const port of workerPorts) port.close();
  });
});
