import type { Clock } from "@pochimail/core/clock";

export type FakeClock = Clock & { advance(ms: number): void; set(date: Date): void };

/** Deterministic Clock for tests. Stub until M1-09 provides the full testing kit. */
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
