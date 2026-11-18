import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PseudoLocalePreview } from "./pseudo-locale-preview.tsx";

describe("pseudo-locale story (P13)", () => {
  it("keeps long accented copy inside wrapping elements (guards overflow when copy expands)", () => {
    const { container } = render(
      <div className="w-[320px]">
        <PseudoLocalePreview />
      </div>,
    );
    expect(container.textContent).toMatch(/[äëïöüÿ]/u);
    expect(container.textContent?.length).toBeGreaterThan(120);
    // jsdom has no layout: these classes are what make the 320px story wrap instead of overflow.
    expect(container.querySelector('[data-slot="status-strip"] .break-words')).not.toBeNull();
    expect(container.querySelector('[data-slot="recommendation-row"] .min-w-0')).not.toBeNull();
    expect(container.querySelector('[data-slot="recommendation-row"] .break-words')).not.toBeNull();
  });
});
