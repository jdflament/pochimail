// @vitest-environment jsdom

import type { AppSettings } from "@pochimail/core/ports/settings-store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRpcClient } from "../../../../shared/ipc/client.ts";
import { serveRpc } from "../../../../shared/ipc/server.ts";
import { fromDomPort } from "../../../../shared/ipc/transport.ts";
import { App } from "../../app/app.tsx";
import { createAppRouter } from "../../router.tsx";

// Radix checkboxes measure themselves; jsdom has no ResizeObserver.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Saved = Pick<AppSettings, "autonomy" | "capabilities">;

const harness = (opts: { failSave?: boolean } = {}) => {
  const calls: string[] = [];
  let saved: Saved = {
    autonomy: "suggest",
    capabilities: {
      "catch-what-matters": true,
      declutter: true,
      organize: true,
      "save-documents": true,
    },
  };
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  serveRpc(fromDomPort(port2), {
    procedures: {
      "app.state": () => ({ status: "ready" as const, hasConnectedAccount: true }),
      "device.name": () => "Mac" as const,
      "accounts.list": () => [
        { id: "acc-1", provider: "google" as const, displayName: "a@example.test" },
      ],
      "overview.get": () => ({ scanned: 0, toReview: 0 }),
      "mailbox.categories": () => ({
        people: 0,
        records: 0,
        "purchases-travel": 0,
        "sign-ins-security": 0,
        notifications: 0,
        newsletters: 0,
        promotions: 0,
      }),
      "digest.get": () => ({ ready: false, itemCount: 0 }),
      "settings.get": () => ({ ...saved, notifications: true }),
      "settings.update": (patch) => {
        if (opts.failSave) throw new Error("disk full");
        calls.push("settings.update");
        saved = {
          autonomy: patch.autonomy ?? saved.autonomy,
          capabilities: patch.capabilities ?? saved.capabilities,
        };
        return undefined;
      },
      "scan.start": ({ accountId }) => {
        calls.push(`scan.start:${accountId}`);
        return { jobId: "job-1" };
      },
    },
    subscriptions: { "app.events": () => undefined, "scan.progress": () => undefined },
  });
  const client = createRpcClient(fromDomPort(port1));
  const router = createAppRouter(
    { getWorkerClient: () => Promise.resolve(client) },
    { initialEntries: ["/setup"] },
  );
  render(<App workerClient={client} router={router} />);
  return { calls, saved: () => saved };
};

describe("Setup screen", () => {
  // Guards: shipping with a capability off or a riskier autonomy than the brief's defaults.
  it("starts with every capability on and Suggest selected", async () => {
    harness();
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(4);
    for (const box of boxes) expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Suggest" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(screen.getByText("Recommended")).toBeTruthy();
  });

  // Guards: the choice being dropped, the scan not starting, or leaving the user on Setup while it runs.
  it("Start sorting saves the choice, starts the scan, and opens Overview", async () => {
    const h = harness();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Declutter" }));
    fireEvent.click(screen.getByRole("radio", { name: "Just look" }));
    fireEvent.click(screen.getByRole("button", { name: "Start sorting" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy());
    expect(h.calls).toEqual(["settings.update", "scan.start:acc-1"]);
    expect(h.saved().autonomy).toBe("just-look");
    expect(h.saved().capabilities.declutter).toBe(false);
  });

  // Guards: Autopilot being picked without the irreversible-unsubscribe and People wording (D9/D10).
  it("shows the Autopilot reminder only while Autopilot is selected", async () => {
    harness();
    await screen.findByRole("radio", { name: "Suggest" });
    expect(screen.queryByText(/at least 90% sure/)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Autopilot" }));
    expect(screen.getByText(/at least 90% sure/)).toBeTruthy();
    expect(screen.getByText(/unsubscribe, which can't be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Suggest" }));
    expect(screen.queryByText(/at least 90% sure/)).toBeNull();
  });

  // Guards: a failed save silently moving on to Overview with a scan nobody configured.
  it("stays on Setup with an alert when saving fails", async () => {
    const h = harness({ failSave: true });
    fireEvent.click(await screen.findByRole("button", { name: "Start sorting" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't start sorting/);
    expect(h.calls).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
  });
});
