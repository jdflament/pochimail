import { CountUp } from "@pochimail/ui/components/count-up";
import { MotionProvider } from "@pochimail/ui/components/motion-provider";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { Sheet, SheetContent, SheetTitle } from "@pochimail/ui/components/sheet";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const segments = [
  { id: "keep", label: "Keep", value: 3, size: "3 GB", pattern: "solid" as const },
  { id: "clean", label: "Clean", value: 2, size: "2 GB", pattern: "hatched" as const },
];

function reducedMotion(on: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: on && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => vi.restoreAllMocks());

// Each case: motion on by default, then off via the OS preference and via the Animations setting.
const modes = [
  ["prefers-reduced-motion", () => reducedMotion(true), (ui: React.ReactNode) => ui],
  [
    "Animations off",
    () => reducedMotion(false),
    (ui: React.ReactNode) => <MotionProvider animations={false}>{ui}</MotionProvider>,
  ],
] as const;

describe.each(modes)("%s", (_name, setup, wrap) => {
  // Guards: the progress line gliding or the finding sliding up when motion is off.
  it("StatusStrip has no glide and no slide-up", () => {
    setup();
    render(wrap(<StatusStrip progress={40} headline="Sorting privately" status="Labeled 214" />));
    expect(document.querySelector("[data-slot=status-progress]")?.className).not.toContain(
      "transition",
    );
    expect(screen.getByText("Labeled 214").className).not.toContain("animate-");
  });

  // Guards: the bar settling from empty when motion is off (it must render final widths at once).
  it("StorageBar renders final widths immediately with no transition", () => {
    setup();
    render(wrap(<StorageBar segments={segments} summary="5 GB used" />));
    const seg = document.querySelector<HTMLElement>("[data-slot=storage-segment]");
    expect(seg?.style.flex).toBe("3 1 0px");
    expect(seg?.style.transition).toBe("");
  });

  // Guards: the count-up rolling from 0 when motion is off.
  it("CountUp shows the final number at once", () => {
    setup();
    render(wrap(<CountUp value={12940} />));
    expect(screen.getByText("12940")).toBeTruthy();
  });

  // Guards: row fold transition (height/opacity) still applied when motion is off.
  it("RecommendationRow folds without a transition", () => {
    setup();
    render(wrap(<RecommendationRow sentence="Archive" reviewLabel="Review" folded />));
    const row = document.querySelector("[data-slot=recommendation-row]");
    expect(row?.getAttribute("data-folded")).toBe("true");
    expect(row?.className).not.toContain("transition");
  });

  // Guards: the sheet slide/scrim animations running (and delaying unmount) when motion is off.
  it("Sheet enters without slide or scrim animation", () => {
    setup();
    render(
      wrap(
        <Sheet open>
          <SheetContent>
            <SheetTitle>Summary</SheetTitle>
          </SheetContent>
        </Sheet>,
      ),
    );
    expect(document.querySelector("[data-slot=sheet-content]")?.className).not.toContain(
      "animate-sheet",
    );
    expect(document.querySelector("[data-slot=sheet-overlay]")?.className).not.toContain(
      "animate-sheet",
    );
  });
});

describe("with motion on", () => {
  // Guards: numbers jumping to the final value instead of rolling up once from 0 (and never settling).
  it("CountUp rolls up from 0 and lands on the value", async () => {
    render(<CountUp value={100} />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(await screen.findByText("100", {}, { timeout: 2000 })).toBeTruthy();
  });

  // Guards: the finding changing without the slide-up (live progress reads as a flicker).
  it("StatusStrip animates a new finding in", () => {
    render(<StatusStrip progress={10} headline="h" status="Labeled 1" />);
    expect(screen.getByText("Labeled 1").className).toContain("animate-finding-in");
  });

  // Guards: the folded row staying reachable by keyboard or screen reader.
  it("a folded row is inert and hidden", () => {
    render(<RecommendationRow sentence="Archive" reviewLabel="Review" folded />);
    const row = document.querySelector("[data-slot=recommendation-row]");
    expect(row?.hasAttribute("inert")).toBe(true);
    expect(row?.getAttribute("aria-hidden")).toBe("true");
  });
});
