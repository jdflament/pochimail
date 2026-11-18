/** Flush cadence, batch size and in-flight window from the M0-14 benchmark (ADR 0002). */
const FLUSH_MS = 50;
const MAX_BATCH = 500;
const MAX_IN_FLIGHT = 2;
/** Events held while the renderer is not acknowledging. Past this the producer is told to fail the subscription. */
const MAX_BUFFERED = 5000;

type Entry<E> = { sub: number; key: string | undefined; data: E };
const slotOf = (sub: number, key: string): string => `${sub}\u0000${key}`;

/**
 * Worker-side event buffer. Posts batches of at most `maxBatch` events; while `maxInFlight` batches are unacknowledged it
 * keeps buffering (so batches fill up instead of flooding the port). Events with a coalesce key replace the older buffered
 * event of the same subscription and key (progress is "latest state"); everything else is delivered once, in order. The
 * flush timer only runs while something is buffered, so an idle or disposed connection holds no timer.
 */
export const createEventBatcher = <E>(
  send: (events: { sub: number; data: E }[]) => void,
  options: { flushMs?: number; maxBatch?: number; maxInFlight?: number; maxBuffered?: number } = {},
) => {
  const flushMs = options.flushMs ?? FLUSH_MS;
  const maxBatch = options.maxBatch ?? MAX_BATCH;
  const maxInFlight = options.maxInFlight ?? MAX_IN_FLIGHT;
  const maxBuffered = options.maxBuffered ?? MAX_BUFFERED;
  let buffer: Entry<E>[] = [];
  const coalesced = new Map<string, Entry<E>>();
  let inFlight = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const flush = (): void => {
    if (stopped || buffer.length === 0 || inFlight >= maxInFlight) return;
    const batch = buffer.slice(0, maxBatch);
    buffer = buffer.slice(maxBatch);
    for (const entry of batch)
      if (entry.key !== undefined) coalesced.delete(slotOf(entry.sub, entry.key));
    inFlight++;
    send(batch.map(({ sub, data }) => ({ sub, data })));
    if (buffer.length === 0) stopTimer();
  };
  const ensureTimer = (): void => {
    if (timer === undefined && !stopped && buffer.length > 0) timer = setInterval(flush, flushMs);
  };

  return {
    /** Returns false when the buffer is full: the event was not queued and the caller should fail the subscription. */
    push: (sub: number, data: E, key?: string): boolean => {
      if (stopped) return true;
      const existing = key === undefined ? undefined : coalesced.get(slotOf(sub, key));
      if (existing !== undefined) {
        existing.data = data;
        return true;
      }
      if (buffer.length >= maxBuffered) return false;
      const entry: Entry<E> = { sub, key, data };
      buffer.push(entry);
      if (key !== undefined) coalesced.set(slotOf(sub, key), entry);
      if (buffer.length >= maxBatch) flush();
      ensureTimer();
      return true;
    },
    /** The renderer processed one batch. */
    ack: (): void => {
      if (inFlight > 0) inFlight--;
      // Only a full batch goes out at once; a small remainder waits for the timer so a fast consumer does not turn every ack into a tiny message.
      if (buffer.length >= maxBatch) flush();
      ensureTimer();
    },
    /** Drops the buffered events of one subscription (unsubscribe). */
    drop: (sub: number): void => {
      buffer = buffer.filter((entry) => entry.sub !== sub);
      for (const [slot, entry] of coalesced) if (entry.sub === sub) coalesced.delete(slot);
      if (buffer.length === 0) stopTimer();
    },
    stop: (): void => {
      stopped = true;
      stopTimer();
      buffer = [];
      coalesced.clear();
    },
  };
};
