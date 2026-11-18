import type { DomainEventOf } from "../events/catalog.ts";

export interface DigestStatus {
  readonly ready: boolean;
  readonly itemCount: number;
}

/**
 * What the digest button shows: whether something new is waiting and how many items. Fed by `DigestReady`
 * events (idempotent on event id, since delivery is at-least-once); counts accumulate.
 */
export class LatestDigest {
  private readonly seen = new Set<string>();
  private itemCount = 0;

  handle(event: DomainEventOf<"DigestReady">): void {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.itemCount += event.payload.itemCount;
  }

  get(): DigestStatus {
    return { ready: this.itemCount > 0, itemCount: this.itemCount };
  }
}
