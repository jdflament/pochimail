// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient } from "../../../../shared/ipc/client.ts";
import { serveRpc } from "../../../../shared/ipc/server.ts";
import { fromDomPort } from "../../../../shared/ipc/transport.ts";
import { App } from "../../app/app.tsx";
import { createAppRouter } from "../../router.tsx";
import * as requiredStates from "../states/required-states.tsx";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-animations");
});

const openGallery = async () => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  serveRpc(fromDomPort(port2), {
    procedures: {},
    subscriptions: { "app.events": () => undefined, "scan.progress": () => undefined },
  });
  const client = createRpcClient(fromDomPort(port1));
  const router = createAppRouter(
    { getWorkerClient: () => Promise.resolve(client) },
    { initialEntries: ["/gallery"] },
  );
  render(<App workerClient={client} router={router} />);
  await screen.findByRole("heading", { level: 1, name: "Dev gallery" });
};

const entries = (kind: "state" | "motion") =>
  [...document.querySelectorAll(`[data-gallery-entry^="${kind}:"]`)].map((el) =>
    el.getAttribute("data-gallery-entry")?.slice(kind.length + 1),
  );

// The motion moments of docs/design.md › Motion catalog (Panels and menus are covered by the summary sheet).
const motionMoments = [
  "LiveProgress",
  "NumbersArrive",
  "StorageSettles",
  "CleanUpThenUndo",
  "SummarySheet",
  "ChoicesRespond",
  "ScreenToScreen",
  "PochiAtRest",
  "PochiFindsSomething",
];

describe("dev gallery", () => {
  // Guards: a new required state or motion moment that ships without being reviewable (or testable by M4-19) in the app shell.
  it("lists every required state and every motion moment of the catalogs", async () => {
    await openGallery();
    expect(entries("state")).toHaveLength(Object.keys(requiredStates).length);
    expect(entries("motion")).toEqual(motionMoments);
  });

  // Guards: theme and reduced-motion toggles that do nothing, so reviewers believe they saw dark / instant motion.
  it("the theme and reduced-motion toggles change the rendering", async () => {
    await openGallery();
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.hasAttribute("data-animations")).toBe(false);

    fireEvent.click(screen.getByRole("switch", { name: "Dark theme" }));
    await waitFor(() => expect(root.classList.contains("dark")).toBe(true));

    fireEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    await waitFor(() => expect(root.getAttribute("data-animations")).toBe("off"));
  });
});
