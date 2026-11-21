import type { DigestStatus, DigestTally } from "../ports/digest-tally.ts";

/** What the digest button shows now. */
export class GetDigestStatus {
  constructor(private readonly deps: { readonly tally: DigestTally }) {}

  execute(): DigestStatus {
    return this.deps.tally.status();
  }
}
