// @vitest-environment jsdom
// Guards: a Connect screen that leaves the person on a wrong state, skips Setup on a first account, or shows Setup again when adding one.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient } from "#shared/ipc/client.ts";
import type { OutputOf } from "#shared/ipc/contract.ts";
import { serveRpc } from "#shared/ipc/server.ts";
import { fromDomPort } from "#shared/ipc/transport.ts";
import { App } from "../../app/app.tsx";
import { createAppRouter } from "../../router.tsx";

afterEach(cleanup);

const harness = (outcomes: OutputOf<"accounts.connect">[], existing = 0, hang = false) => {
  let release: (() => void) | undefined;
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  let connects = 0;
  serveRpc(fromDomPort(port2), {
    procedures: {
      "app.state": () => ({ status: "ready" as const, hasConnectedAccount: existing > 0 }),
      "device.name": () => "Mac" as const,
      "accounts.list": () =>
        Array.from({ length: existing }, (_, n) => ({
          id: `acc-${n}`,
          provider: "google" as const,
          displayName: "a@example.test",
        })),
      "accounts.cancelConnect": () => {
        release?.();
      },
      "accounts.connect": async () => {
        connects += 1;
        if (hang) await new Promise<void>((resolve) => (release = resolve));
        return outcomes.shift() ?? { status: "failed" as const, reason: "unknown" as const };
      },
      "settings.get": () => ({
        autonomy: "suggest" as const,
        capabilities: {
          "catch-what-matters": true,
          declutter: true,
          organize: true,
          "save-documents": true,
        },
        notifications: true,
      }),
    },
    subscriptions: { "app.events": () => undefined, "scan.progress": () => undefined },
  });
  const client = createRpcClient(fromDomPort(port1));
  const router = createAppRouter(
    { getWorkerClient: () => Promise.resolve(client) },
    { initialEntries: ["/connect"] },
  );
  render(<App workerClient={client} router={router} />);
  return { router, connects: () => connects };
};

describe("Connect screen", () => {
  it("offers Google, a disabled Microsoft, the promises and the IMAP line", async () => {
    harness([]);
    expect(await screen.findByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    const microsoft = screen.getByRole("button", { name: /Continue with Microsoft/ });
    expect((microsoft as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My promises" })).toBeTruthy();
    expect(screen.getByText("Nothing is deleted without your OK")).toBeTruthy();
    expect(screen.getByText(/add more accounts later/)).toBeTruthy();
    expect(screen.getByText(/IMAP\) are coming in version 1\.1/)).toBeTruthy();
  });

  it("a first account goes to Setup", async () => {
    const h = harness([{ status: "connected", accountId: "acc-1" }]);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/setup"));
  });

  it("adding an account to an existing setup skips Setup", async () => {
    const h = harness([{ status: "connected", accountId: "acc-9" }], 1);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/overview"));
  });

  it("cancelled shows one primary action that tries again", async () => {
    const h = harness([{ status: "cancelled" }, { status: "connected", accountId: "acc-1" }]);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign-in was cancelled");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(h.router.state.location.pathname).toBe("/setup"));
    expect(h.connects()).toBe(2);
  });

  it("a failure shows the error state, naming a missing sign-in setup", async () => {
    harness([{ status: "failed", reason: "not-configured" }]);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("no Google sign-in");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("Cancel while waiting stops the sign-in and shows the cancelled state", async () => {
    harness([{ status: "cancelled" }], 0, true);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign-in was cancelled");
  });

  it("a consent without an address explains itself", async () => {
    harness([{ status: "failed", reason: "no-address" }]);
    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("email address");
  });
});
