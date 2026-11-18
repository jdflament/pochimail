import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Mascot, MascotProvider } from "./mascot";
import { mascotBehaviorContract } from "./mascot-contract";

describe("Mascot behavior contract", () => {
  mascotBehaviorContract((element) => renderToStaticMarkup(element));
});

describe("Mascot public behavior", () => {
  it("guards wrong pose assets by rendering the requested pose with 1x and 2x sources", () => {
    const html = renderToStaticMarkup(<Mascot pose="reading" />);
    expect(html).toContain('data-pose="reading"');
    expect(html).toMatch(
      /srcSet="[^"]*pochi-reading\.png[^"]* 1x, [^"]*pochi-reading@2x\.png[^"]* 2x"/,
    );
  });

  it("guards idle loops missing when animations are enabled by running breathing and blink loops", () => {
    const html = renderToStaticMarkup(
      <MascotProvider animations>
        <Mascot pose="default" />
      </MascotProvider>,
    );
    expect(html).toContain("animate-pochi-breathe");
    expect(html).toContain("animate-pochi-blink");
    expect(html).not.toContain("animate-pochi-found");
  });

  it("guards missing found reaction by playing the squish-bounce when Pochi finds something", () => {
    const html = renderToStaticMarkup(<Mascot reaction="found" />);
    expect(html).toContain("animate-pochi-found");
    expect(html).toContain('data-reaction="found"');
  });

  it("guards found reaction animating when Animations are off", () => {
    const html = renderToStaticMarkup(
      <MascotProvider animations={false}>
        <Mascot reaction="found" />
      </MascotProvider>,
    );
    expect(html).not.toContain("animate-pochi-found");
    expect(html).not.toContain("animate-pochi-breathe");
    expect(html).not.toContain("animate-pochi-blink");
  });
});
