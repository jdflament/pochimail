// @vitest-environment node
import { readFileSync } from "node:fs";
import { MOTION, MOTION_EASE } from "@pochimail/ui/lib/motion";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const board = read("../../../../docs/design/screens/source/Motion.dc.html");
const css = read("../styles/globals.css");

describe("motion catalog timings", () => {
  // Guards: a constant drifting from the design board (the P5 source of truth) without anyone noticing.
  it("every catalog timing and the easing appear in Motion.dc.html", () => {
    const fromBoard = (re: RegExp) => Number(re.exec(board)?.[1]);
    expect(MOTION_EASE.replaceAll(" ", "")).toBe("cubic-bezier(0.22,1,0.36,1)");
    expect(board).toContain(MOTION_EASE.replaceAll(" ", ""));
    expect(fromBoard(/width: \{\{pct\}\}%; transition: width (\d+)ms/)).toBe(MOTION.progressMs);
    expect(fromBoard(/\{\{bw0\}\}%[^"]*transition: width (\d+)ms/)).toBe(MOTION.storageBarMs);
    expect(fromBoard(/transition: width \d+ms [^ ]+ (\d+)ms"/)).toBe(
      MOTION.storageBarHatchedDelayMs,
    );
    expect(fromBoard(/transition: max-height (\d+)ms/)).toBe(MOTION.rowFoldMs);
    expect(fromBoard(/opacity (\d+)ms ease-out; \{\{rowStyle/)).toBe(MOTION.rowFadeMs);
    expect(fromBoard(/transition: transform (\d+)ms/)).toBe(MOTION.switchMs);
    expect(fromBoard(/const k = Math\.min\(1, \(Date\.now\(\) - t0\) \/ (\d+)\)/)).toBe(
      MOTION.countUpMs,
    );
    expect(fromBoard(/(\d+)ms<\/strong> summary sheet enter/)).toBe(MOTION.sheetMs);
    expect(fromBoard(/(\d+)ms<\/strong> panels, steps, toasts/)).toBe(MOTION.panelMs);
    expect(board).toContain(`${MOTION.pressMs}ms`);
    expect(board).toContain(`${MOTION.mascotBreathingMs / 1000}s`);
    expect(board).toContain(`${MOTION.mascotBlinkMs / 1000}s`);
    expect(board).toContain(`${MOTION.mascotFoundMs}ms`);
  });

  // Guards: CSS keyframe durations drifting from the constants the tests above pin to the board.
  it("CSS animations use the catalog durations and one easing", () => {
    const anim = (name: string) =>
      new RegExp(
        `--animate-${name}: [\\w-]+ (\\d+)ms ${MOTION_EASE.replace(/[()]/g, "\\$&")}`,
      ).exec(css)?.[1];
    expect(Number(anim("sheet-in"))).toBe(MOTION.sheetMs);
    expect(Number(anim("sheet-scrim-in"))).toBe(MOTION.sheetMs);
    expect(Number(anim("screen-in"))).toBe(MOTION.screenMs);
    expect(Number(anim("finding-in"))).toBe(MOTION.panelMs);
    expect(Number(anim("pochi-found"))).toBe(MOTION.mascotFoundMs);
    expect(css).toMatch(new RegExp(`\\[data-sonner-toast\\][^}]*${MOTION.toastMs}ms`));
  });

  // Guards: a decorative loop sneaking in; only Pochi's breathing and blink may repeat.
  it("only the mascot animations loop", () => {
    const loops = [...css.matchAll(/--animate-([\w-]+):[^;]*\binfinite\b/g)].map((m) => m[1]);
    expect(loops.sort()).toEqual(["pochi-blink", "pochi-breathe"]);
  });

  // Guards: CSS-only motion (sheet, screen slide, panels) still animating under reduced motion or Animations off.
  it("reduced motion and Animations off both collapse CSS durations", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^}]*transition-delay: 0s/);
    expect(css).toMatch(/\[data-animations="off"\][^{]*\{[^}]*animation-duration: 0\.01ms/);
    expect(css).toMatch(/\[data-animations="off"\][^{]*\{[^}]*transition-duration: 0\.01ms/);
  });
});
