// Guards: a sign-in answer carrying a token or free text reaching the renderer (accounts.connect answers a closed set).
import { expect, it } from "vitest";
import { createRpcClient } from "./client.ts";
import { serveRpc } from "./server.ts";
import { fromDomPort } from "./transport.ts";

const link = (answers: unknown[]) => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  serveRpc(fromDomPort(port2), {
    procedures: { "accounts.connect": () => answers.shift() as never },
    subscriptions: {},
  });
  return createRpcClient(fromDomPort(port1));
};

it("drops a token next to the account id and rejects a free-text failure reason", async () => {
  const client = link([
    { status: "connected", accountId: "acc_1", token: "refresh-secret" },
    { status: "failed", reason: "invalid_grant for person@example.test" },
  ]);
  expect(await client.call("accounts.connect", { provider: "google" })).toEqual({
    status: "connected",
    accountId: "acc_1",
  });
  await expect(client.call("accounts.connect", { provider: "google" })).rejects.toMatchObject({
    code: "BAD_OUTPUT",
  });
});

it("accepts Google only until Microsoft sign-in lands", async () => {
  const client = link([]);
  await expect(
    client.call("accounts.connect", { provider: "microsoft" } as never),
  ).rejects.toMatchObject({ code: "BAD_INPUT" });
});
