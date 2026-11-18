import { CheckboxCard } from "@pochimail/ui/components/checkbox-card";
import { EmptyState } from "@pochimail/ui/components/empty-state";
import { MascotProvider } from "@pochimail/ui/components/mascot";
import { PillRadioGroup, PillRadioGroupItem } from "@pochimail/ui/components/pill-radio-group";
import { RadioCard } from "@pochimail/ui/components/radio-card";
import { RadioGroup } from "@pochimail/ui/components/radio-group";
import { Toaster } from "@pochimail/ui/components/sonner";
import { SpeechBubble } from "@pochimail/ui/components/speech-bubble";
import { useRunOnce } from "@pochimail/ui/hooks/use-run-once";
import { act, configure, getConfig, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("checkbox card", () => {
  const cards = (
    <fieldset aria-label="What should I help with?">
      <CheckboxCard title="Declutter" description="Unsubscribe and archive." />
      <CheckboxCard title="Organize" description="Sort email into categories." defaultChecked />
    </fieldset>
  );

  // Guards: a card that looks selected but is not a real checkbox (no role, no announced state).
  it("announces its checked state and toggles when the card text is clicked", async () => {
    render(cards);
    const declutter = screen.getByRole("checkbox", { name: "Declutter" });
    expect(declutter.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("checkbox", { name: "Organize" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    await userEvent.click(screen.getByText("Unsubscribe and archive."));
    expect(declutter.getAttribute("aria-checked")).toBe("true");
  });

  // Guards: mouse-only cards (keyboard users cannot reach or toggle them), and a lost description.
  it("is reachable with Tab, toggles with Space and exposes its description", async () => {
    render(cards);
    await userEvent.tab();
    const declutter = screen.getByRole("checkbox", { name: "Declutter" });
    expect(document.activeElement).toBe(declutter);
    await userEvent.keyboard(" ");
    expect(declutter.getAttribute("aria-checked")).toBe("true");
    expect(declutter.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(declutter.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Unsubscribe and archive.");
  });
});

describe("radio card", () => {
  const modes = (
    <RadioGroup aria-label="How much can I do?" defaultValue="suggest">
      <RadioCard value="look" title="Just look" description="I never change anything." />
      <RadioCard value="suggest" title="Suggest" badge="Recommended" description="You approve." />
      <RadioCard value="auto" title="Autopilot" description="I handle the obvious." />
    </RadioGroup>
  );

  // Guards: selecting a second card leaving the first checked, or the choice not being announced.
  it("checks exactly one card at a time and announces which", async () => {
    render(modes);
    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(1);
    await userEvent.click(screen.getByText("I handle the obvious."));
    const checked = screen.getAllByRole("radio", { checked: true });
    expect(checked).toHaveLength(1);
    expect(checked[0]).toBe(screen.getByRole("radio", { name: "Autopilot" }));
  });

  // Guards: arrow-key navigation lost (the group must be one Tab stop that moves with arrows).
  it("moves the choice with the arrow keys from a single Tab stop", async () => {
    render(modes);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Suggest" }));
    // Radix checks on the frame after focus moves, while the arrow key is still held: hold it, then release.
    await userEvent.keyboard("{ArrowDown>}");
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Autopilot" }).getAttribute("aria-checked")).toBe(
        "true",
      ),
    );
    await userEvent.keyboard("{/ArrowDown}");
    await userEvent.tab();
    expect(screen.getAllByRole("radio")).not.toContain(document.activeElement);
  });

  // Guards: the "Recommended" marker being decoration only (it must be text a screen reader reads).
  it("shows the recommended badge as text next to its title", () => {
    render(modes);
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.getAllByText(/Recommended/)).toHaveLength(1);
  });
});

// Guards: the cadence choice losing its radio semantics or allowing two cadences at once.
it("pill radio group selects one cadence and announces it", async () => {
  const onValueChange = vi.fn();
  render(
    <PillRadioGroup aria-label="Keep it tidy" defaultValue="weekly" onValueChange={onValueChange}>
      <PillRadioGroupItem value="daily">Daily</PillRadioGroupItem>
      <PillRadioGroupItem value="weekly">Weekly</PillRadioGroupItem>
      <PillRadioGroupItem value="monthly">Monthly</PillRadioGroupItem>
    </PillRadioGroup>,
  );
  expect(screen.getByRole("radio", { name: "Weekly" }).getAttribute("aria-checked")).toBe("true");
  await userEvent.click(screen.getByRole("radio", { name: "Monthly" }));
  expect(onValueChange).toHaveBeenCalledExactlyOnceWith("monthly");
  expect(screen.getAllByRole("radio", { checked: true })).toEqual([
    screen.getByRole("radio", { name: "Monthly" }),
  ]);
});

describe("empty state", () => {
  // Guards: an empty or error state that is a dead end, or that offers two competing primary actions.
  it("always renders exactly one primary action, secondary stays quiet", async () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <EmptyState
        title="Nothing to clean here"
        action={{ label: "Back to overview", onClick: onAction }}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(onAction).toHaveBeenCalledTimes(1);

    rerender(
      <EmptyState
        title="I lost access to your Gmail"
        action={{ label: "Reconnect", onClick: onAction }}
        secondaryAction={{ label: "Remove account", onClick: vi.fn() }}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    const primary = buttons.filter((b) => b.className.includes("bg-primary"));
    expect(primary).toHaveLength(1);
    expect(primary[0]?.textContent).toBe("Reconnect");
  });

  // Guards: a second h1 per screen (brief §6) or a title that is not a heading.
  it("titles itself with an h2", () => {
    render(<EmptyState title="You’re offline" action={{ label: "Got it", onClick: vi.fn() }} />);
    expect(screen.getByRole("heading", { level: 2, name: "You’re offline" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});

// Guards: "Show Pochi" off hiding the words along with the mascot.
it("speech bubble keeps its message when Pochi is hidden", () => {
  render(
    <MascotProvider showPochi={false}>
      <SpeechBubble pose="happy">Hi, I’m Pochi.</SpeechBubble>
    </MascotProvider>,
  );
  expect(screen.getByText("Hi, I’m Pochi.")).toBeTruthy();
  expect(document.querySelector("[data-slot=mascot]")).toBeNull();
});

// Let sonner mount the toast (RTL's waitFor does not drive vitest's fake timers).
const flush = () => act(() => vi.advanceTimersByTimeAsync(50));

describe("undo toast", () => {
  // RTL's default asyncWrapper waits on a real setTimeout, which never fires once vitest fakes it.
  const { asyncWrapper } = getConfig();
  beforeEach(() => configure({ asyncWrapper: (cb) => cb() }));
  afterEach(() => {
    configure({ asyncWrapper });
    vi.useRealTimers();
  });

  // Guards: Undo firing twice (double click while the toast animates out), or the toast sticking past 5s.
  it("fires undo once and auto-dismisses after 5 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime, delay: null });
    const onUndo = vi.fn();
    let show = (_message: string, _onUndo: () => void) => {};
    function Harness() {
      const once = useRunOnce();
      show = (message, undo) => {
        toast(message, {
          duration: 5000,
          action: { label: "Undo", onClick: once(undo) },
        });
      };
      return <Toaster theme="dark" />;
    }
    render(<Harness />);
    act(() => {
      show("24 emails archived", onUndo);
    });
    await flush();
    expect(screen.getByText("24 emails archived")).toBeTruthy();

    await user.dblClick(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    // Sonner pauses its timers while the pointer is over the toasts.
    await user.unhover(screen.getByRole("button", { name: "Undo" }));
    act(() => {
      show("Left alone", vi.fn());
    });
    await flush();
    expect(screen.getByText("Left alone")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000 - 100);
    });
    expect(screen.queryByText("Left alone")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Left alone")).toBeNull();
  });
});
