import { MotionProvider } from "@pochimail/ui/components/motion-provider";
import type * as React from "react";
import { expect, it } from "vitest";
import {
  MASCOT_BLINK_DURATION_MS,
  MASCOT_BREATHING_DURATION_MS,
  MASCOT_FOUND_DURATION_MS,
  Mascot,
  type MascotPose,
  MascotProvider,
} from "../components/mascot";

export type MascotRender = (element: React.ReactElement) => string;

const POSES: readonly MascotPose[] = ["default", "happy", "reading", "saving", "night"];

function stubReducedMotion(matches: boolean): () => void {
  if (typeof window === "undefined") return () => {};
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

export function mascotBehaviorContract(render: MascotRender): void {
  it("guards still mascot when Animations preference is off", () => {
    const html = render(
      <MotionProvider animations={false}>
        <Mascot pose="default" />
      </MotionProvider>,
    );
    expect(html).not.toMatch(/animate-pochi-(breathe|blink|found)/);
  });

  it("guards still mascot when prefers-reduced-motion is active", () => {
    const restore = stubReducedMotion(true);
    try {
      const html = render(
        <MascotProvider>
          <Mascot pose="default" />
        </MascotProvider>,
      );
      expect(html).not.toMatch(/animate-pochi-(breathe|blink|found)/);
    } finally {
      restore();
    }
  });

  it("guards layout shift when Show Pochi is off by rendering no mascot but keeping layout intact", () => {
    const html = render(
      <MascotProvider showPochi={false}>
        <Mascot pose="happy" />
      </MascotProvider>,
    );
    expect(html).not.toContain('data-slot="mascot"');
    expect(html).not.toContain("<img");
    expect(html).toContain('data-slot="mascot-placeholder"');
    expect(html).toContain("invisible");
  });

  it("guards wrong motion timings by exposing Motion.dc.html values as constants", () => {
    expect(MASCOT_BREATHING_DURATION_MS).toBe(4200);
    expect(MASCOT_BLINK_DURATION_MS).toBe(5300);
    expect(MASCOT_FOUND_DURATION_MS).toBe(620);
  });

  it("guards decorative mascot announcing itself by defaulting to empty alt text", () => {
    const html = render(<Mascot pose="default" />);
    expect(html).toMatch(/alt=""/);
  });

  it("guards missing pose render paths by rendering every existing pose", () => {
    for (const pose of POSES) {
      const html = render(<Mascot pose={pose} />);
      expect(html).toContain(`data-pose="${pose}"`);
      expect(html).toMatch(new RegExp(`pochi-${pose}\\.png`));
    }
  });
}
