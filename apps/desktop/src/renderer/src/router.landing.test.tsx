// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient } from "../../shared/ipc/client.ts";
import { serveRpc } from "../../shared/ipc/server.ts";
import { fromDomPort } from "../../shared/ipc/transport.ts";
import { App } from "./app/app.tsx";

afterEach(cleanup);

const createFakeAppClient = (hasConnectedAccount: boolean) => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  serveRpc(fromDomPort(port2), {
    procedures: {
      "app.state": () => ({ status: "ready" as const, hasConnectedAccount }),
      "device.name": () => "device" as const,
      "accounts.list": () => [],
      "overview.get": () => ({ scanned: 0, toReview: 0 }),
      "digest.get": () => ({ ready: false, itemCount: 0 }),
      "settings.get": () => ({ autopilot: false, notifications: true }),
    },
    subscriptions: {
      "app.events": () => undefined,
      "scan.progress": () => undefined,
    },
  });
  const client = createRpcClient(fromDomPort(port1));
  return {
    client,
    close: () => {
      port1.close();
      port2.close();
    },
  };
};

describe("first-run redirect from app.state", () => {
  it("lands on Welcome on first launch when no account is connected", async () => {
    const fake = createFakeAppClient(false);
    render(<App workerClient={fake.client} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Welcome" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
    fake.close();
  });

  it("lands on Overview when a connected account already exists", async () => {
    const fake = createFakeAppClient(true);
    render(<App workerClient={fake.client} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Welcome" })).toBeNull();
    fake.close();
  });
});
