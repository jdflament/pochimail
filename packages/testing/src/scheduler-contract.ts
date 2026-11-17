import type { CancelSignal } from "@pochimail/core/ports/common";
import type { Scheduler } from "@pochimail/core/ports/scheduler";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

export interface SchedulerHarness {
  readonly scheduler: Scheduler;
  /** Lets `ms` of (virtual or real) time pass and every due task finish. */
  advance(ms: number): Promise<void>;
}

export const schedulerChecks: readonly Check<SchedulerHarness>[] = [
  check(
    "after runs once, and not before its delay (guards early or repeated one-shot work)",
    async ({ scheduler, advance }) => {
      let runs = 0;
      scheduler.after(100, async () => void runs++);
      await advance(99);
      expect(runs).toBe(0);
      await advance(1);
      await advance(500);
      expect(runs).toBe(1);
    },
  ),
  check(
    "every runs once per interval (guards a missed or doubled periodic sync)",
    async ({ scheduler, advance }) => {
      let runs = 0;
      scheduler.every(100, async () => void runs++);
      await advance(100);
      await advance(100);
      await advance(100);
      expect(runs).toBe(3);
    },
  ),
  check(
    "unsubscribe stops further runs and is harmless twice (guards work continuing after sign-out)",
    async ({ scheduler, advance }) => {
      let runs = 0;
      const stop = scheduler.every(100, async () => void runs++);
      await advance(100);
      stop();
      stop();
      await advance(300);
      expect(runs).toBe(1);
    },
  ),
  check(
    "cancelling aborts the signal a running task holds (guards a cancelled scan that keeps going)",
    async ({ scheduler, advance }) => {
      let seen: CancelSignal | null = null;
      const stop = scheduler.after(10, async (signal) => {
        seen = signal;
      });
      await advance(10);
      expect((seen as CancelSignal | null)?.aborted).toBe(false);
      stop();
      expect((seen as CancelSignal | null)?.aborted).toBe(true);
    },
  ),
  check(
    "a task that throws does not stop other schedules or its own repeat (guards one failure halting background work)",
    async ({ scheduler, advance }) => {
      let good = 0;
      let bad = 0;
      scheduler.every(100, async () => {
        bad++;
        throw new Error("task bug");
      });
      scheduler.every(100, async () => void good++);
      await advance(100);
      await advance(100);
      expect({ good, bad }).toEqual({ good: 2, bad: 2 });
    },
  ),
];

/** Contract for any `Scheduler`. `make` returns a fresh scheduler with no tasks. */
export function schedulerContract(make: () => SchedulerHarness | Promise<SchedulerHarness>): void {
  registerContract("Scheduler contract", schedulerChecks, make);
}
