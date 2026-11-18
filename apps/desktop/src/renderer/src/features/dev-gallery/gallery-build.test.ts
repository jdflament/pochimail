import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import electronViteConfig from "../../../../../electron.vite.config.ts";

afterEach(() => vi.unstubAllEnvs());

/** Builds the renderer from the real electron.vite.config.ts (same define, plugins and input), into a temp dir. */
const buildRenderer = async (): Promise<{ files: string[]; code: string }> => {
  const config =
    typeof electronViteConfig === "function"
      ? await electronViteConfig({ command: "build", mode: "production" })
      : electronViteConfig;
  const renderer = config.renderer;
  if (renderer === undefined) throw new Error("electron.vite.config.ts has no renderer config");
  const outDir = mkdtempSync(join(tmpdir(), "pochimail-gallery-"));
  try {
    await build({
      ...renderer,
      configFile: false,
      logLevel: "silent",
      build: { ...renderer.build, outDir, emptyOutDir: true, minify: false },
    });
    const assets = readdirSync(join(outDir, "assets"));
    const code = assets
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(outDir, "assets", f), "utf8"))
      .join("\n");
    return { files: assets, code };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
};

describe("dev gallery in built renderers", () => {
  // Guards: the dev-only /gallery route (and the stories behind it) shipping in the packaged app.
  it("a production build has no gallery route and no gallery chunk", async () => {
    vi.stubEnv("POCHIMAIL_E2E", "");
    const { files, code } = await buildRenderer();
    expect(files.some((f) => f.includes("dev-gallery"))).toBe(false);
    expect(code).not.toContain('"/gallery"');
  }, 120_000);

  // Guards: the check above passing only because the real config no longer produces the gallery anywhere.
  it("an E2E build does contain the gallery route and chunk", async () => {
    vi.stubEnv("POCHIMAIL_E2E", "1");
    const { files, code } = await buildRenderer();
    expect(files.some((f) => f.includes("dev-gallery"))).toBe(true);
    expect(code).toContain('"/gallery"');
  }, 120_000);
});
