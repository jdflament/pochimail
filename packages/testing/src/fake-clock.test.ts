import { createFakeClock } from "@pochimail/testing/fake-clock";
import { expect, it } from "vitest";

// Guards: time only moves when a test says so, and callers cannot mutate the clock via returned dates.
it("stays frozen until advanced and hands out copies", () => {
  const clock = createFakeClock(new Date(1000));
  clock.now().setTime(0);
  expect(clock.now().getTime()).toBe(1000);
  clock.advance(500);
  expect(clock.now().getTime()).toBe(1500);
});

// Guards: set() jumping time backwards/forwards deterministically for expiry tests.
it("set() moves time to an exact instant", () => {
  const clock = createFakeClock();
  clock.set(new Date("2030-05-05T00:00:00.000Z"));
  expect(clock.now().toISOString()).toBe("2030-05-05T00:00:00.000Z");
  clock.advance(1000);
  expect(clock.now().toISOString()).toBe("2030-05-05T00:00:01.000Z");
});
