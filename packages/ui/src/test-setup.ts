import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Files that opt out of jsdom (`@vitest-environment node`) skip the DOM shims.
const hasDom = typeof window !== "undefined";

// jsdom lacks matchMedia (sonner reads it for the OS theme); components under test only need a static answer.
if (hasDom)
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;

if (hasDom) afterEach(cleanup);

// jsdom lacks pointer capture (sonner calls it on pointerdown).
if (hasDom)
  for (const m of ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"] as const) {
    (Element.prototype as unknown as Record<string, unknown>)[m] ??= () => false;
  }
