import { CountUp } from "@pochimail/ui/components/count-up";
import { Mascot, MascotProvider } from "@pochimail/ui/components/mascot";
import { MotionProvider } from "@pochimail/ui/components/motion-provider";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { Toaster, undoToast } from "@pochimail/ui/components/sonner";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { t } from "@pochimail/ui/i18n/format.ts";
import { I18nProvider } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
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

const modes = [
  ["prefers-reduced-motion", () => reducedMotion(true), (ui: React.ReactNode) => ui],
  [
    "Animations off",
    () => reducedMotion(false),
    (ui: React.ReactNode) => <MotionProvider animations={false}>{ui}</MotionProvider>,
  ],
] as const;

describe.each(modes)("%s", (_name, setup, wrap) => {
  // Guards: the bar settling from empty (a transform-free but still animated fill) when motion is off.
  it("StorageBar renders final widths immediately", () => {
    setup();
    render(wrap(<StorageBar segments={segments} summary="5 GB used" />));
    const seg = document.querySelector<HTMLElement>("[data-slot=storage-segment]");
    expect(seg?.style.flex).toBe("3 1 0px");
    expect(seg?.style.transition).toBe("");
  });

  // Guards: the count-up rolling through intermediate values when motion is off.
  it("CountUp shows the final number at once", () => {
    setup();
    render(wrap(<CountUp value={12940} />));
    expect(screen.getAllByText("12940")).toHaveLength(2);
  });
});

describe("MotionProvider", () => {
  // Guards: Animations off leaking to the rest of the app after the provider unmounts (or never being applied to CSS-only motion).
  it("sets data-animations=off on the document and clears it on unmount", () => {
    const { unmount } = render(<MotionProvider animations={false}>x</MotionProvider>);
    expect(document.documentElement.getAttribute("data-animations")).toBe("off");
    unmount();
    expect(document.documentElement.hasAttribute("data-animations")).toBe(false);
  });

  // Guards: two writers for the Animations setting, so a nested MascotProvider keeps Pochi moving while Animations is off.
  it("holds Pochi still even inside a MascotProvider", () => {
    const html = renderToStaticMarkup(
      <MotionProvider animations={false}>
        <MascotProvider>
          <Mascot pose="default" />
        </MascotProvider>
      </MotionProvider>,
    );
    expect(html).not.toMatch(/animate-pochi/);
  });
});

describe("flipping the Animations setting while a motion component is mounted", () => {
  // Guards: a conditional hook in useMotionEnabled that crashes the screen when Animations is toggled at runtime.
  it("keeps CountUp mounted and shows its final value", () => {
    reducedMotion(false);
    const ui = (animations: boolean) => (
      <MotionProvider animations={animations}>
        <CountUp value={42} />
      </MotionProvider>
    );
    const { rerender } = render(ui(true));
    rerender(ui(false));
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
    rerender(ui(true));
    expect(screen.getAllByText("42").length).toBeGreaterThan(0);
  });
});

describe("with motion on", () => {
  // Guards: numbers jumping to the final value instead of rolling up once from 0.
  it("CountUp rolls up from 0 and lands on the value", async () => {
    render(<CountUp value={100} />);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    await vi.waitFor(() => expect(screen.getAllByText("100")).toHaveLength(2), { timeout: 2000 });
  });

  // Guards: screen readers hearing 0 and every intermediate value instead of the final number once.
  it("CountUp exposes the final value once to assistive tech", () => {
    render(<CountUp value={12940} />);
    const readable = screen
      .getAllByText(/\d/)
      .filter((el) => el.getAttribute("aria-hidden") !== "true");
    expect(readable.map((el) => el.textContent)).toEqual(["12940"]);
  });

  // Guards: the finding changing without the slide-up (live progress reads as a flicker).
  it("StatusStrip animates a new finding in", () => {
    render(<StatusStrip progress={10} headline="h" status="Labeled 1" />);
    expect(screen.getByText("Labeled 1").className).toContain("animate-finding-in");
  });

  // Guards: the folded row staying reachable by keyboard or screen reader, or folding with a guessed max-height instead of its real height.
  it("a folded row is inert, hidden, and transitions its measured height", () => {
    render(<RecommendationRow sentence="Archive" reviewLabel="Review" folded />);
    const row = document.querySelector<HTMLElement>("[data-slot=recommendation-row]");
    expect(row?.hasAttribute("inert")).toBe(true);
    expect(row?.getAttribute("aria-hidden")).toBe("true");
    expect(row?.style.transition).toContain("height 260ms");
    expect(row?.className).not.toMatch(/max-h-/);
  });

  // Guards: Undo firing twice or no toast shown after a cleanup.
  it("undoToast shows the message and runs Undo once", async () => {
    const onUndo = vi.fn();
    render(<Toaster theme="dark" />);
    act(() => {
      undoToast("24 emails archived", onUndo);
    });
    const undo = await screen.findByRole("button", { name: t("action.undo") });
    await userEvent.dblClick(undo);
    expect(screen.getByText("24 emails archived")).toBeTruthy();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  // Guards: an open undo toast keeping the old language after the language changes.
  it("an open undo toast follows a language change", async () => {
    const ui = (locale: "en" | "fr") => (
      <I18nProvider locale={locale}>
        <Toaster theme="dark" />
      </I18nProvider>
    );
    const { rerender } = render(ui("en"));
    act(() => {
      undoToast("24 emails archived", vi.fn());
    });
    await screen.findAllByRole("button", { name: "Undo" });
    rerender(ui("fr"));
    expect((await screen.findAllByRole("button", { name: "Annuler" })).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Undo" })).toEqual([]);
  });
});
