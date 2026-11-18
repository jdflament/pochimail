import type { Clock } from "@pochimail/core/clock";

export type FakeClock = Clock & { advance(ms: number): void; set(date: Date): void };

/** Deterministic Clock for tests. Shared by every in-memory fake that needs time. */
export function createFakeClock(start: Date = new Date("2026-01-01T00:00:00.000Z")): FakeClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    advance: (ms) => {
      current += ms;
    },
    set: (date) => {
      current = date.getTime();
    },
  };
}
