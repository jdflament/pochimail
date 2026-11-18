// @vitest-environment jsdom
import { StatusLine } from "@pochimail/ui/components/status-line";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

afterEach(cleanup);

it("stays a mounted polite status region when empty (guards an unannounced live region)", () => {
  const { rerender } = render(<StatusLine />);
  const region = screen.getByRole("status");
  expect(region.getAttribute("aria-live")).toBeNull();
  rerender(<StatusLine>Offline</StatusLine>);
  expect(screen.getByRole("status")).toBe(region);
  expect(region.textContent).toBe("Offline");
});
