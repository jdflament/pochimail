/** Minimal timer port so core never touches a platform timer and tests stay deterministic. */
export type Timer = {
  /** Schedules `fn` once after `ms`; returns a cancel function. */
  set(fn: () => void, ms: number): () => void;
};

export type EventBatcherOptions<E> = {
  readonly windowMs: number;
  readonly timer: Timer;
  /** Merges everything seen in one window into the single event that is emitted. */
  readonly coalesce: (events: readonly [E, ...E[]]) => E;
  readonly emit: (event: E) => void;
};

export interface EventBatcher<E> {
  add(event: E): void;
  /** Emits the pending window now (e.g. before shutdown). No-op when nothing is pending. */
  flush(): void;
}

/** Coalesces high-rate streams (sync progress): the first event opens a window, one event leaves it. */
export function createEventBatcher<E>(options: EventBatcherOptions<E>): EventBatcher<E> {
  let pending: [E, ...E[]] | null = null;
  let cancel: (() => void) | null = null;

  function flush(): void {
    cancel?.();
    cancel = null;
    const batch = pending;
    pending = null;
    if (batch) options.emit(options.coalesce(batch));
  }

  return {
    add(event) {
      if (pending) {
        pending.push(event);
        return;
      }
      pending = [event];
      cancel = options.timer.set(flush, options.windowMs);
    },
    flush,
  };
}
