// @vitest-environment node
import { readFileSync } from "node:fs";
import { Button } from "@pochimail/ui/components/button";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

// Guards: brief §6 44px primary buttons; secondary/ghost keep the 32px minimum.
it("primary buttons are 44px tall, others at least 32px", () => {
  expect(renderToStaticMarkup(<Button>Review</Button>)).toContain("min-h-11");
  expect(renderToStaticMarkup(<Button variant="secondary">Cancel</Button>)).toContain("min-h-8");
  expect(renderToStaticMarkup(<Button variant="ghost">Undo</Button>)).toContain("min-h-8");
});

// Guards: a caller's className must override variant classes (cn() last), not be merged inside cva.
it("lets className override variant classes", () => {
  const html = renderToStaticMarkup(<Button className="min-h-16">Review</Button>);
  expect(html).toContain("min-h-16");
  expect(html).not.toContain("min-h-11");
});

// Guards: the composed dialog close (portal-rendered, so checked in source) keeps a 32px target and focus-visible only.
it("dialog close has a 32px target and uses focus-visible", () => {
  const src = readFileSync(new URL("./dialog.stories.tsx", import.meta.url), "utf8");
  const close = src.match(/data-slot="dialog-close"\s+className="([^"]*)"/)?.[1] ?? "";
  expect(close).toContain("size-8");
  expect(close).toContain("focus-visible:ring-2");
  expect(close).not.toMatch(/(^| )focus:/);
});
