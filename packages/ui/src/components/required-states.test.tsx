import {
  EmptyCategoryState,
  ModelDownloadFailedState,
  NeedsReconnectState,
  NothingToDoState,
  OfflineStatusLine,
  RateLimitState,
  SignInCancelledState,
  UpdateReadyState,
} from "@pochimail/ui/components/required-states";
import { setLocale } from "@pochimail/ui/i18n/format.ts";
import {
  minutesUntil,
  noRequiredStates,
  type RequiredStateEvent,
  reduceRequiredStates,
} from "@pochimail/ui/lib/required-states";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  setLocale("en");
});

// One row per state: the failure it names, its single primary action and how it announces.
type Case = {
  name: string;
  ui: (onAction: () => void, onSecondary: () => void) => React.ReactElement;
  role: "alert" | "status";
  title: string;
  primary: string;
  secondary?: string;
};
const cases: Case[] = [
  {
    name: "sign-in cancelled",
    ui: (a, s) => <SignInCancelledState onAction={a} onSecondary={s} />,
    role: "status",
    title: "Sign-in was cancelled",
    primary: "Try again",
    secondary: "Choose another account",
  },
  {
    name: "account needs reconnecting",
    ui: (a, s) => <NeedsReconnectState provider="Gmail" onAction={a} onSecondary={s} />,
    role: "alert",
    title: "I lost access to your Gmail account",
    primary: "Reconnect",
    secondary: "Remove account",
  },
  {
    name: "model download failed",
    ui: (a, s) => <ModelDownloadFailedState onAction={a} onSecondary={s} />,
    role: "alert",
    title: "The assistant model didn’t download",
    primary: "Retry download",
    secondary: "Continue with rules",
  },
  {
    name: "provider rate limit",
    ui: (a) => <RateLimitState provider="Google" minutes={4} onAction={a} />,
    role: "status",
    title: "Google is slowing me down",
    primary: "Got it",
  },
  {
    name: "empty category",
    ui: (a) => <EmptyCategoryState onAction={a} />,
    role: "status",
    title: "Nothing to clean here",
    primary: "Back to overview",
  },
  {
    name: "nothing to do",
    ui: (a) => <NothingToDoState onAction={a} />,
    role: "status",
    title: "Nothing to do",
    primary: "Back to overview",
  },
  {
    name: "update ready",
    ui: (a, s) => <UpdateReadyState version="1.2" onAction={a} onSecondary={s} />,
    role: "status",
    title: "A new version is ready",
    primary: "Restart now",
    secondary: "What’s new",
  },
];

describe("required states (brief §6)", () => {
  for (const c of cases) {
    it(`${c.name}: is announced as ${c.role} and named by its failure (guards a silent or unnamed state)`, () => {
      render(
        c.ui(
          () => {},
          () => {},
        ),
      );
      expect(screen.getByRole(c.role, { name: c.title })).toBeTruthy();
    });

    it(`${c.name}: offers exactly one primary action that fires (guards a dead end or two primaries)`, async () => {
      const onAction = vi.fn();
      const onSecondary = vi.fn();
      render(c.ui(onAction, onSecondary));
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(c.secondary ? 2 : 1);
      await userEvent.click(screen.getByRole("button", { name: c.primary }));
      expect(onAction).toHaveBeenCalledTimes(1);
      if (c.secondary) {
        await userEvent.click(screen.getByRole("button", { name: c.secondary }));
        expect(onSecondary).toHaveBeenCalledTimes(1);
      }
    });
  }

  it("offline is a polite status line, never a dialog (guards a blocking offline pop-up)", () => {
    render(<OfflineStatusLine onAction={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("You’re offline");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("rate limit shows the resume estimate in minutes (guards a missing time estimate)", () => {
    render(<RateLimitState provider="Google" minutes={4} onAction={() => {}} />);
    expect(screen.getByText(/in 4 minutes/u)).toBeTruthy();
  });

  it("renders French and Japanese copy from the catalog (guards a hard-coded English state)", () => {
    setLocale("fr");
    render(<RateLimitState provider="Google" minutes={1} onAction={() => {}} />);
    expect(screen.getByRole("status", { name: "Google me ralentit" })).toBeTruthy();
    cleanup();
    setLocale("ja");
    render(<EmptyCategoryState onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "概要に戻る" })).toBeTruthy();
  });
});

describe("required states from worker events", () => {
  const run = (...events: RequiredStateEvent[]) =>
    events.reduce(reduceRequiredStates, noRequiredStates);

  it("rate limit clears itself when the event stream resumes (guards a stuck rate-limit notice)", () => {
    const limited = run({ type: "RateLimited", provider: "Google", resumeAt: 240_000 });
    expect(limited.rateLimit).toEqual({ provider: "Google", resumeAt: 240_000 });
    expect(reduceRequiredStates(limited, { type: "SyncResumed" }).rateLimit).toBeNull();
  });

  it("offline ends when the connection returns (guards a status line that never leaves)", () => {
    expect(run({ type: "Offline" }).offline).toBe(true);
    expect(run({ type: "Offline" }, { type: "Online" }).offline).toBe(false);
  });

  it("reconnecting one account keeps the other flagged (guards clearing every account)", () => {
    const state = run(
      { type: "NeedsReauth", accountId: "a", provider: "Gmail" },
      { type: "NeedsReauth", accountId: "b", provider: "Outlook" },
      { type: "Reconnected", accountId: "a" },
    );
    expect(state.needsReauth).toEqual([{ accountId: "b", provider: "Outlook" }]);
  });

  it("a retried sign-in or download clears its failure (guards a stale failure after retry)", () => {
    const state = run(
      { type: "SignInCancelled" },
      { type: "ModelDownloadFailed" },
      { type: "SignInStarted" },
      { type: "ModelDownloadStarted" },
    );
    expect(state.signInCancelled).toBe(false);
    expect(state.modelDownloadFailed).toBe(false);
  });

  it("the resume estimate rounds up and never reads 0 (guards '0 minutes')", () => {
    expect(minutesUntil(61_000, 0)).toBe(2);
    expect(minutesUntil(1_000, 5_000)).toBe(1);
  });
});
