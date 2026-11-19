import { cn } from "@pochimail/ui/lib/utils";
import { expect, it } from "vitest";

// Guards: the public `lib/*` export resolves, and cn() lets the last conflicting Tailwind class win.
it("merges conflicting Tailwind classes through its public export", () => {
  expect(cn("px-2 text-sm", false, "px-4")).toBe("text-sm px-4");
});

// Guards: a named type step is not mistaken for a color, so it does not drop the text color next to it.
it("keeps a design-scale text size and a text color together", () => {
  expect(cn("text-body text-muted-foreground")).toBe("text-body text-muted-foreground");
  expect(cn("text-caption", "text-body")).toBe("text-body");
});
