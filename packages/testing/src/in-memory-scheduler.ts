import type { CancelSignal } from "@pochimail/kernel/common";
import type { Scheduler } from "@pochimail/pipeline/scheduler";
import type { FakeClock } from "./fake-clock.ts";

export interface FakeScheduler extends Scheduler {
  /** Moves the clock forward, running every task that comes due, in time order. */
  advance(ms: number): Promise<void>;
  /** Tasks that threw; the scheduler keeps running either way. */
  taskFailures(): readonly unknown[];
}

interface Slot {
  at: number;
  readonly every: number | null;
  readonly task: (signal: CancelSignal) => Promise<void>;
  readonly controller: AbortController;
}

/** Virtual-time scheduler: nothing runs until a test calls `advance`. */
export function createFakeScheduler(clock: FakeClock): FakeScheduler {
  const slots = new Set<Slot>();
  const failures: unknown[] = [];

  const add = (delay: number, every: number | null, task: Slot["task"]) => {
    const slot: Slot = {
      at: clock.now().getTime() + delay,
      every,
      task,
      controller: new AbortController(),
    };
    slots.add(slot);
    return () => {
      slot.controller.abort();
      slots.delete(slot);
    };
  };

  return {
    taskFailures: () => failures.slice(),
    every: (intervalMs, task) => add(intervalMs, intervalMs, task),
    after: (delayMs, task) => add(delayMs, null, task),
    async advance(ms) {
      const target = clock.now().getTime() + ms;
      for (;;) {
        const next = [...slots].filter((s) => s.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        clock.set(new Date(next.at));
        if (next.every === null) slots.delete(next);
        else next.at += next.every;
        try {
          await next.task(next.controller.signal);
        } catch (error) {
          failures.push(error);
        }
      }
      clock.set(new Date(target));
    },
  };
}
