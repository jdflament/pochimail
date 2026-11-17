import { describe, expect, it } from "vitest";
import { createEchoClient, serveEcho, type Transport } from "./echo.ts";

const asTransport = (port: MessagePort): Transport => ({
  post: (message) => port.postMessage(message),
  onMessage: (handler) => port.addEventListener("message", (event) => handler(event.data)),
});

const connect = () => {
  const { port1, port2 } = new MessageChannel();
  const client = asTransport(port1);
  const server = asTransport(port2);
  port1.start();
  port2.start();
  return { client, server, close: () => (port1.close(), port2.close()) };
};

describe("echo RPC over a MessagePort", () => {
  // Guards: renderer <-> worker round trip must work on the port alone, with no main-process handler in the path.
  it("returns each request's own text, even when several are in flight", async () => {
    const { client, server, close } = connect();
    serveEcho(server);
    const rpc = createEchoClient(client);
    await expect(Promise.all([rpc.echo("one"), rpc.echo("two"), rpc.echo("three")])).resolves.toEqual(["one", "two", "three"]);
    close();
  });

  // Guards: a malformed message (untrusted boundary) must neither crash the worker nor get an answer.
  it("ignores messages that fail the schema and keeps serving", async () => {
    const { client, server, close } = connect();
    serveEcho(server);
    client.post({ id: "not-a-number", type: "echo", text: 42 });
    client.post("garbage");
    await expect(createEchoClient(client).echo("still alive")).resolves.toBe("still alive");
    close();
  });

  // Guards: the UI must not wait forever when the worker is dead.
  it("rejects when the worker never answers", async () => {
    const { client, close } = connect();
    await expect(createEchoClient(client, 20).echo("hello")).rejects.toThrow("worker did not answer");
    close();
  });
});
