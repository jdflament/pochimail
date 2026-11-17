import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const dir = new URL("./", import.meta.url);
const hardCoded =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(|\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)/;

// Guards: AGENTS.md §7 "never hard-code colors": every component color must come from a design token.
it("components use design tokens only, never literal colors", () => {
  const offenders = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => hardCoded.test(readFileSync(new URL(f, dir), "utf8")));
  expect(offenders).toEqual([]);
});
