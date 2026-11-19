import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import electronViteConfig from "../../../../../electron.vite.config.ts";
import { galleryDefine } from "../../../../shared/gallery-build.ts";

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

/** The workspace root: the nearest parent holding pnpm-workspace.yaml. */
const workspaceRoot = (from: string): string => {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) throw new Error("no pnpm-workspace.yaml above the test");
  }
};

describe("Storybook builds of the renderer", () => {
  // Guards: stories mounting the real router failing with "__X__ is not defined" because only
  // electron-vite and Vitest define the renderer's compile-time globals (the Onboarding stories, #157).
  it("define every compile-time global the renderer declares, with the value the app uses", () => {
    const root = workspaceRoot(import.meta.dirname);
    const declared = readFileSync(join(import.meta.dirname, "../../env.d.ts"), "utf8")
      .split("\n")
      .flatMap((line) => /^declare const (__\w+__):/.exec(line)?.[1] ?? []);
    expect(declared).toContain("__POCHIMAIL_GALLERY__");
    // Storybook's config lives in packages/ui and must not import apps/desktop, so read it as text.
    const config = readFileSync(join(root, "packages/ui/.storybook/main.ts"), "utf8");
    const defined = Object.fromEntries(
      [...config.matchAll(/(__\w+__):\s*"([^"]*)"/g)].map(([, name, value]) => [name, value]),
    );
    for (const name of declared) expect(Object.keys(defined), name).toContain(name);
    // The gallery is on in Storybook: the value is the one galleryDefine(true) gives the app.
    expect(defined).toEqual(galleryDefine(true));
  });
});
