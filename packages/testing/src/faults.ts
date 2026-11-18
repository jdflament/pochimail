/**
 * Switch for forcing a fake to fail on demand. Each fake owns one and exposes it as `faults`;
 * tests call `failWith` to simulate a storage failure, `Offline`, `RateLimited`, `AiUnavailable`…
 */
export interface Faults<E extends Error> {
  /** The next `times` calls fail with `error` (default: every call until `clear`). */
  failWith(error: E, options?: { times?: number }): void;
  clear(): void;
  /** For fakes: returns the error the current call must fail with, or `null`. */
  take(): E | null;
}

export function createFaults<E extends Error>(): Faults<E> {
  let pending: { error: E; remaining: number } | null = null;
  return {
    failWith(error, options = {}) {
      pending = { error, remaining: options.times ?? Number.POSITIVE_INFINITY };
    },
    clear() {
      pending = null;
    },
    take() {
      if (!pending) return null;
      const { error } = pending;
      pending.remaining -= 1;
      if (pending.remaining <= 0) pending = null;
      return error;
    },
  };
}
