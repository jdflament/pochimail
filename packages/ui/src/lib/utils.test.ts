import { expect, it } from "vitest";
import { cn } from "@pochimail/ui/lib/utils";

// Guards: the public `lib/*` export resolves, and cn() lets the last conflicting Tailwind class win.
it("merges conflicting Tailwind classes through its public export", () => {
  expect(cn("px-2 text-sm", false, "px-4")).toBe("text-sm px-4");
});
