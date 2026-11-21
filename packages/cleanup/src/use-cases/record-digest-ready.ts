import type { DigestReady } from "../events.ts";
import type { DigestTally } from "../ports/digest-tally.ts";

/** Feeds the digest button from `DigestReady` events (delivery is at-least-once, so the tally is idempotent on event id). */
export class RecordDigestReady {
  constructor(private readonly deps: { readonly tally: DigestTally }) {}

  execute(event: DigestReady): void {
    this.deps.tally.record(event.id, event.payload.itemCount);
  }
}
