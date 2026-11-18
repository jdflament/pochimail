import { LedgerRow } from "@pochimail/ui/components/ledger-row";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { SignalRow } from "@pochimail/ui/components/signal-row";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

// Guards: a Review button that is not wired (or fires twice) in each row that has one.
it.each([
  [
    "signal row",
    (onReview: () => void) => <SignalRow figure={7} title="waiting" onReview={onReview} />,
  ],
  [
    "recommendation row",
    (onReview: () => void) => <RecommendationRow sentence="Unsubscribe" onReview={onReview} />,
  ],
])("%s: clicking Review calls onReview once", async (_name, row) => {
  const onReview = vi.fn();
  render(<ul>{row(onReview)}</ul>);
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(onReview).toHaveBeenCalledTimes(1);
});

// Guards: Pause/Resume stuck on one label, or reporting the wrong next state.
it("status strip toggles between Pause and Resume and reports the next state", async () => {
  const onPausedChange = vi.fn();
  function Harness() {
    const [paused, setPaused] = useState(false);
    return (
      <StatusStrip
        progress={40}
        headline="Sorting"
        paused={paused}
        onPausedChange={(next) => {
          onPausedChange(next);
          setPaused(next);
        }}
      />
    );
  }
  render(<Harness />);
  await userEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(onPausedChange).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(onPausedChange).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
});

// Guards: progress announcements lost (brief §6: role=status + aria-live=polite) or a width outside 0-100%.
it("status strip is a polite live region and clamps progress", () => {
  const html = renderToStaticMarkup(<StatusStrip progress={140} headline="Sorting" />);
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("width:100%");
  expect(html).toContain("100%</span>");
});

// Guards: a storage bar that is only colors/patterns for screen readers, or legend text drifting from the segments.
it("storage bar names every segment in its label and legend", () => {
  const html = renderToStaticMarkup(
    <StorageBar
      summary="6.4 GB used"
      segments={[
        { id: "a", label: "Worth keeping", value: 33, size: "3.3 GB", pattern: "solid" },
        { id: "b", label: "Can be cleaned", value: 31, size: "3.1 GB", pattern: "hatched" },
      ]}
    />,
  );
  expect(html).toContain('aria-label="6.4 GB used: 3.3 GB Worth keeping, 3.1 GB Can be cleaned"');
  expect(html).toContain("Worth keeping · 3.3 GB");
  expect(html).toContain('data-pattern="hatched"');
});

// Guards: the proportional bar showing below 760px (container query) or its width diverging from the share.
it("ledger bar is hidden until the row is 760px wide and reflects the share", () => {
  const html = renderToStaticMarkup(<LedgerRow label="Newsletters" count={10410} share={0.62} />);
  expect(html).toContain("hidden");
  expect(html).toContain("@[760px]:block");
  expect(html).toContain("width:62%");
  expect(renderToStaticMarkup(<LedgerRow label="People" count={3} />)).not.toContain("ledger-bar");
});

// Guards: counts rendered without grouping/locale or without tabular numbers (columns would jitter).
it("ledger counts use the locale and tabular numbers", () => {
  const html = renderToStaticMarkup(<LedgerRow label="x" count={10410} locale="en" />);
  expect(html).toContain("10,410");
  expect(html).toContain("tabular-nums");
});

// Guards: actions under the 32px minimum target or without a visible focus style (brief §6).
it("row actions keep a 32px target and focus-visible ring", () => {
  const html = renderToStaticMarkup(
    <>
      <SignalRow figure={1} title="a" />
      <RecommendationRow sentence="b" />
      <StatusStrip progress={1} headline="c" />
    </>,
  );
  for (const m of html.matchAll(/<button[^>]*class="([^"]*)"/g)) {
    expect(m[1]).toContain("min-h-8");
    expect(m[1]).toContain("focus-visible:ring-2");
  }
  expect(html.match(/<button/g)).toHaveLength(4);
});
