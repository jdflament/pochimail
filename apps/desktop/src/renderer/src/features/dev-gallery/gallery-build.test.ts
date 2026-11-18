import { resolve } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { galleryDefine, galleryEnabled } from "../../../../shared/gallery-build.ts";

const bundle = async (enabled: boolean): Promise<string> => {
  const output = await build({
    configFile: false,
    logLevel: "silent",
    define: galleryDefine(enabled),
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve(import.meta.dirname, "../../router.tsx"), formats: ["es"] },
    },
  });
  const outputs = Array.isArray(output) ? output : [output];
  return outputs
    .flatMap((o) => ("output" in o ? o.output : []))
    .map((chunk) => (chunk.type === "chunk" ? chunk.code : ""))
    .join("\n");
};

describe("dev gallery build flag", () => {
  // Guards: the dev-only /gallery route (and the stories behind it) shipping in the packaged app.
  it("a production bundle has no gallery route and no gallery code", async () => {
    const production = await bundle(galleryEnabled("build", {}));
    expect(production).not.toContain("/gallery");
    expect(production).not.toContain("Sorting privately on this Mac");
  }, 60_000);

  // Guards: the check above passing only because the probe strings changed.
  it("a dev or E2E bundle does contain the route", async () => {
    const dev = await bundle(galleryEnabled("build", { POCHIMAIL_E2E: "1" }));
    expect(dev).toContain("/gallery");
    expect(dev).toContain("Sorting privately on this Mac");
  }, 60_000);
});
