import type { DigestTally } from "../ports/digest-tally.ts";

/** Counts in memory; counts accumulate across events and survive nothing but the process. */
export function createInMemoryDigestTally(): DigestTally {
  const seen = new Set<string>();
  let itemCount = 0;
  return {
    record(eventId, count) {
      if (seen.has(eventId)) return;
      seen.add(eventId);
      itemCount += count;
    },
    status: () => ({ ready: itemCount > 0, itemCount }),
  };
}
