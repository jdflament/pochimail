// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createRpcClient } from "../../../../shared/ipc/client.ts";
import type { EventOf, OutputOf } from "../../../../shared/ipc/contract.ts";
import { serveRpc } from "../../../../shared/ipc/server.ts";
import { fromDomPort } from "../../../../shared/ipc/transport.ts";
import { App } from "../../app/app.tsx";
import { createAppRouter } from "../../router.tsx";

afterEach(cleanup);

type Overview = OutputOf<"overview.get">;
const empty: Overview = {
  scanned: 0,
  toReview: 0,
  waiting: 0,
  deadlines: 0,
  important: 0,
  oldestWaitingDays: 0,
  cleanable: [],
};
const sorted: Overview = {
  scanned: 1000,
  toReview: 10,
  waiting: 7,
  deadlines: 1,
  important: 2,
  oldestWaitingDays: 9,
  cleanable: [
    { category: "newsletters", count: 300 },
    { category: "notifications", count: 120 },
  ],
};

const setup = (initial: Record<string, Overview>, path = "/overview") => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  const state = {
    overviews: structuredClone(initial),
    asked: [] as (string | undefined)[],
    calls: [] as string[],
    emitters: new Map<string, ((e: EventOf<"scan.progress">) => void)[]>(),
    /** Sends progress once the screen has subscribed for that account. */
    progress: async (event: EventOf<"scan.progress">) => {
      await waitFor(() => expect(state.emitters.has(event.accountId)).toBe(true));
      for (const emit of state.emitters.get(event.accountId) ?? []) emit(event);
    },
  };
  serveRpc(fromDomPort(port2), {
    procedures: {
      "app.state": () => ({ status: "ready" as const, hasConnectedAccount: true }),
      "device.name": () => "device" as const,
      "accounts.list": () => [
        { id: "a1", provider: "google" as const, displayName: "ann@example.test" },
        { id: "a2", provider: "microsoft" as const, displayName: "ann@work.example.test" },
      ],
      "mailbox.categories": () => ({
        people: 0,
        records: 0,
        "purchases-travel": 0,
        "sign-ins-security": 0,
        notifications: 0,
        newsletters: 0,
        promotions: 0,
      }),
      "overview.get": ({ accountId }) => {
        state.asked.push(accountId);
        return state.overviews[accountId ?? "all"] ?? empty;
      },
      "digest.get": () => ({ ready: false, itemCount: 0 }),
      "settings.get": () => ({ autopilot: false, notifications: true }),
      "scan.start": ({ accountId }) => {
        state.calls.push(`start:${accountId}`);
        return { jobId: `job-${accountId}` };
      },
      "scan.pause": ({ jobId }) => void state.calls.push(`pause:${jobId}`),
      "scan.resume": ({ jobId }) => void state.calls.push(`resume:${jobId}`),
    },
    subscriptions: {
      "app.events": () => undefined,
      "scan.progress": ({ accountId }, emit) => {
        state.emitters.set(accountId, [...(state.emitters.get(accountId) ?? []), emit]);
        return undefined;
      },
    },
  });
  const client = createRpcClient(fromDomPort(port1));
  const router = createAppRouter(
    { getWorkerClient: () => Promise.resolve(client) },
    { initialEntries: [path] },
  );
  render(<App workerClient={client} router={router} />);
  return state;
};

describe("overview", () => {
  it("shows the figures the worker computed, hiding rows that are zero (guards zeros in a ledger)", async () => {
    setup({ all: sorted });
    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeTruthy();
    expect(await screen.findByText("people are waiting on you")).toBeTruthy();
    expect(screen.getByText("The oldest has waited 9 days")).toBeTruthy();
    expect(screen.getByText("Unsubscribe from newsletters")).toBeTruthy();
    expect(screen.getByText("Archive notifications")).toBeTruthy();
    expect(screen.queryByText("Unsubscribe from promotion senders")).toBeNull();
    expect(
      screen.getByText("Conversations with people, records and receipts are never cleaned."),
    ).toBeTruthy();
  });

  it("changes figures in place when a progress event arrives, without going back to a loading state (guards flicker and stale numbers)", async () => {
    const state = setup({ all: { ...sorted, waiting: 7 } });
    await screen.findByText("people are waiting on you");
    state.overviews.all = { ...sorted, waiting: 8, toReview: 11 };
    await state.progress({ accountId: "a1", phase: "classifying", processed: 500, total: 1000 });
    await state.progress({ accountId: "a2", phase: "classifying", processed: 0, total: 1000 });

    await waitFor(() => expect(screen.getByText("8")).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByRole("status", { name: "Loading your overview" })).toBeNull();
    const strip = await screen.findByText("500 of 2,000 emails sorted");
    expect(strip).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("pauses and resumes the running scans of the selected accounts only (guards a Pause that does nothing or restarts finished scans)", async () => {
    const user = userEvent.setup();
    const state = setup({ all: sorted });
    await screen.findByText("people are waiting on you");
    await state.progress({ accountId: "a1", phase: "classifying", processed: 10, total: 100 });
    await state.progress({ accountId: "a2", phase: "done", processed: 50, total: 50 });

    await user.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(state.calls).toContain("pause:job-a1"));
    expect(state.calls.filter((c) => c.endsWith("a2"))).toEqual([]);
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(state.calls).toContain("resume:job-a1"));
  });

  it("asks for the selected account only and answers with its numbers (guards an Overview that ignores the account switcher)", async () => {
    const state = setup(
      { all: sorted, a2: { ...empty, scanned: 5, toReview: 2, waiting: 2, oldestWaitingDays: 1 } },
      "/overview?account=a2",
    );
    await screen.findByText("people are waiting on you");
    expect(state.asked).toEqual(["a2"]);
    expect(screen.queryByText("Unsubscribe from newsletters")).toBeNull();
    expect(within(document.body).getByText("1 account")).toBeTruthy();
  });

  it("shows the empty state, not a ledger of zeros, for an account with no emails (guards zeros on a fresh account)", async () => {
    setup({ all: empty });
    expect(await screen.findByRole("heading", { name: "No emails yet" })).toBeTruthy();
    expect(screen.queryByText("Catch what matters")).toBeNull();
  });

  it("says nothing needs attention when the mailbox is sorted and clean (guards an empty section with no sentence)", async () => {
    setup({ all: { ...empty, scanned: 40 } });
    expect(await screen.findByText("Nothing needs you right now.")).toBeTruthy();
    expect(screen.getByText("Nothing to clean up right now.")).toBeTruthy();
  });
});
