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
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

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

it("sizes by container query on one layer: bottom below 560px, centred from 560px (guards a desktop sheet on phones; jsdom cannot lay out, Storybook and M4-19 check the pixels)", async () => {
  render(<Harness />);
  await open();
  const layer = document.querySelector("[data-slot=sheet-layer]");
  const content = screen.getByRole("dialog");
  expect(layer?.classList.contains("@container")).toBe(true);
  expect(layer?.contains(content)).toBe(true);
  expect(content.className).toContain("@max-[559px]:rounded-t-2xl");
  expect(content.className).toContain("@min-[560px]:self-center");
});

it("mounts inside a given container (guards a sheet that cannot be framed in stories and tests)", async () => {
  const frame = document.createElement("div");
  document.body.append(frame);
  render(
    <Sheet defaultOpen>
      <SheetContent container={frame}>
        <SheetTitle>Framed</SheetTitle>
        <SheetDescription>In a frame</SheetDescription>
      </SheetContent>
    </Sheet>,
  );
  expect(frame.contains(screen.getByRole("dialog", { name: "Framed" }))).toBe(true);
  frame.remove();
});
