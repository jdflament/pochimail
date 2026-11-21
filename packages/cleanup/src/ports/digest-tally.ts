export interface DigestStatus {
  readonly ready: boolean;
  readonly itemCount: number;
}

/** What the digest button shows: whether something new is waiting and how many items. */
export interface DigestTally {
  /** Counts a delivered `DigestReady` once; the same event id again changes nothing. */
  record(eventId: string, itemCount: number): void;
  status(): DigestStatus;
}
