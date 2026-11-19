import type { Timer } from "@pochimail/pipeline/event-batching";

export type FakeTimer = Timer & { advance(ms: number): void };

/** Deterministic Timer: callbacks fire only when `advance` crosses their deadline. */
export function createFakeTimer(): FakeTimer {
  let now = 0;
  let tasks: { at: number; fn: () => void }[] = [];
  return {
    set(fn, ms) {
      const task = { at: now + ms, fn };
      tasks.push(task);
      return () => {
        tasks = tasks.filter((t) => t !== task);
      };
    },
    advance(ms) {
      now += ms;
      const due = tasks.filter((t) => t.at <= now);
      tasks = tasks.filter((t) => t.at > now);
      for (const t of due) t.fn();
    },
  };
}
