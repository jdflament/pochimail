import type { DigestTally } from "@pochimail/cleanup/ports/digest-tally";

/** The digest button's counts, kept in memory for the life of the worker; counts accumulate across events. */
export function createDigestTally(): DigestTally {
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
