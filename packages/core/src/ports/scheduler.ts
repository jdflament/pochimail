import type { CancelSignal, Unsubscribe } from "./common.ts";

/** Runs background work. Each task receives a signal that aborts when its schedule is cancelled. */
export interface Scheduler {
  every(intervalMs: number, task: (signal: CancelSignal) => Promise<void>): Unsubscribe;
  after(delayMs: number, task: (signal: CancelSignal) => Promise<void>): Unsubscribe;
}
