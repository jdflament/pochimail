import { Button } from "@pochimail/ui/components/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pochimail/ui/components/sheet";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let layerWidth = 1000;
let fire: Array<() => void> = [];

beforeEach(() => {
  layerWidth = 1000;
  fire = [];
  const rect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this.getAttribute("data-slot") === "sheet-layer"
      ? ({ width: layerWidth } as DOMRect)
      : rect.call(this);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: (entries: unknown[]) => void) {}
      observe(target: Element) {
        // Only the sheet's own layer is resized here; Radix observes other boxes too.
        if (target.getAttribute("data-slot") !== "sheet-layer") return;
        fire.push(() => this.callback([{ contentRect: { width: layerWidth } }]));
      }
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness() {
  return (
    <>
      <button type="button">Before</button>
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription>Sentence</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="ghost">Later</Button>
            </SheetClose>
            <Button>Review</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

const open = async () => {
  const opener = screen.getByRole("button", { name: "Open" });
  await userEvent.click(opener);
  return opener;
};

it("Esc closes the sheet and returns focus to the opener (guards focus lost to the page body)", async () => {
  render(<Harness />);
  const opener = await open();
  expect(screen.getByRole("dialog", { name: "Title" })).toBeTruthy();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it.each([
  ["the × button", () => screen.getByRole("button", { name: "Close" })],
  ["a SheetClose action", () => screen.getByRole("button", { name: "Later" })],
])(
  "%s closes the sheet and returns focus to the opener (guards a dead close control)",
  async (_n, control) => {
    render(<Harness />);
    const opener = await open();
    await userEvent.click(control());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  },
);

it("traps Tab inside the open sheet and labels it by its title and sentence (guards focus escaping to the page behind)", async () => {
  render(<Harness />);
  await open();
  const dialog = screen.getByRole("dialog", { name: "Title" });
  expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  for (let i = 0; i < 6; i++) {
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  }
  await userEvent.tab({ shift: true });
  expect(dialog.contains(document.activeElement)).toBe(true);
});

it("is a centred sheet at 560px and wider and a bottom sheet below it, from the same markup (guards a desktop sheet on phones)", async () => {
  layerWidth = 560;
  render(<Harness />);
  await open();
  const content = () => screen.getByRole("dialog");
  const dialog = content();
  expect(content().getAttribute("data-layout")).toBe("centered");
  layerWidth = 559;
  act(() => {
    for (const f of fire) f();
  });
  expect(content().getAttribute("data-layout")).toBe("bottom");
  expect(content()).toBe(dialog);
  layerWidth = 800;
  act(() => {
    for (const f of fire) f();
  });
  expect(content().getAttribute("data-layout")).toBe("centered");
});

it("starts as a bottom sheet when it opens in a narrow container (guards a wrong-layout first frame)", async () => {
  layerWidth = 400;
  render(<Harness />);
  await open();
  expect(screen.getByRole("dialog").getAttribute("data-layout")).toBe("bottom");
});
