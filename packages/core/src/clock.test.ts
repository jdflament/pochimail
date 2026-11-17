import type { Clock } from "@pochimail/core/clock";
import { expect, it } from "vitest";

// Guards: the Clock port stays a plain `now(): Date` so any adapter or fake satisfies it.
it("is satisfiable by a plain object", () => {
  const clock: Clock = { now: () => new Date(0) };
  expect(clock.now().getTime()).toBe(0);
});
