import { LedgerRow } from "@pochimail/ui/components/ledger-row";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { SignalRow } from "@pochimail/ui/components/signal-row";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

type Props = { children?: ReactNode; onClick?: () => void; [k: string]: unknown };

// No DOM in this package's test env: expand the (hook-free) function components and find an element by data-slot.
function find(node: ReactNode, slot: string): ReactElement<Props> | undefined {
  if (Array.isArray(node)) return node.map((n) => find(n, slot)).find(Boolean);
  if (!isValidElement<Props>(node)) return undefined;
  if (node.props["data-slot"] === slot && typeof node.type === "string") return node;
  const out =
    typeof node.type === "function"
      ? (node.type as (p: Props) => ReactNode)(node.props)
      : node.props.children;
  if (typeof node.type === "function" && node.props["data-slot"] === slot && out) {
    const inner = find(out, slot);
    if (inner) return inner;
  }
  return find(out, slot);
}

// Guards: a Review button that is not wired (or fires twice) in each row that has one.
it.each([
  ["signal-review", <SignalRow key="s" figure={7} title="waiting" onReview={vi.fn()} />],
  [
    "recommendation-review",
    <RecommendationRow key="r" sentence="Unsubscribe" onReview={vi.fn()} />,
  ],
])("%s calls onReview once when clicked", (slot, el) => {
  const onReview = (el.props as { onReview: () => void }).onReview;
  const button = find(
    el.type === SignalRow ? SignalRow(el.props) : RecommendationRow(el.props),
    slot,
  );
  expect(button?.type).toBe("button");
  button?.props.onClick?.();
  expect(onReview).toHaveBeenCalledTimes(1);
});

// Guards: Pause/Resume stuck on one label, or reporting the wrong next state.
it("status strip toggles between Pause and Resume and reports the next state", () => {
  const onPausedChange = vi.fn();
  const running = StatusStrip({ progress: 40, headline: "Sorting", onPausedChange });
  find(running, "status-toggle")?.props.onClick?.();
  expect(onPausedChange).toHaveBeenLastCalledWith(true);
  expect(renderToStaticMarkup(running)).toContain("Pause");

  const paused = StatusStrip({ progress: 40, headline: "Sorting", paused: true, onPausedChange });
  find(paused, "status-toggle")?.props.onClick?.();
  expect(onPausedChange).toHaveBeenLastCalledWith(false);
  expect(renderToStaticMarkup(paused)).toContain("Resume");
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
