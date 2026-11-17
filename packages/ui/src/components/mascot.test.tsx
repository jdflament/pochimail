import { Mascot, MascotProvider } from "@pochimail/ui/components/mascot";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

// Guards: a pose renders its own 1x/2x assets (a missing/mixed-up pose silently shows the wrong Pochi).
it("renders the requested pose with 1x and 2x sources", () => {
  const html = renderToStaticMarkup(<Mascot pose="reading" />);
  expect(html).toContain('data-pose="reading"');
  expect(html).toMatch(
    /srcSet="[^"]*pochi-reading\.png[^"]* 1x, [^"]*pochi-reading@2x\.png[^"]* 2x"/,
  );
});

// Guards: "Show Pochi" off must hide every mascot, whatever the pose.
it("renders nothing when Show Pochi is off", () => {
  const html = renderToStaticMarkup(
    <MascotProvider showPochi={false}>
      <Mascot pose="happy" />
    </MascotProvider>,
  );
  expect(html).toBe("");
});

// Guards: the breathing loop must stay behind the motion-safe variant so reduced-motion users get a still Pochi.
it("only animates under motion-safe", () => {
  const html = renderToStaticMarkup(<Mascot />);
  const animated = html
    .match(/class="([^"]*)"/)?.[1]
    ?.split(" ")
    .filter((c) => c.includes("animate-"));
  expect(animated).toEqual(["motion-safe:animate-pochi-breathe"]);
});
