import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { OnboardingStepper } from "./onboarding-stepper";

// Guards: the indicator conveying progress by color alone (screen readers got nothing).
it("exposes the active step and the total to assistive tech", () => {
  render(<OnboardingStepper total={3} current={2} label="Step 2 of 3" />);
  const list = screen.getByRole("list", { name: "Step 2 of 3" });
  const items = list.querySelectorAll("li");
  expect(items).toHaveLength(3);
  expect([...items].map((item) => item.getAttribute("aria-current"))).toEqual([null, "step", null]);
});
