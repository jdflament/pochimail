import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { DigestStateReader, DigestStateRepository } from "./digest-state-repository.ts";
import type { MailboxFacts } from "./mailbox-facts.ts";
import type { SuggestionReader, SuggestionRepository } from "./suggestion-repository.ts";

/** Only exists inside `CleanupUnitOfWork.run`: the sole way to write suggestions, digest state or events. */
export interface CleanupTransaction {
  readonly repositories: {
    readonly suggestions: SuggestionRepository;
    readonly digestState: DigestStateRepository;
  };
  readonly events: EventSink;
}

/**
 * Suggestion and digest-state writes and their events commit atomically: `work` returning `ok`
 * commits all of them; `err`, a throw or an aborted `signal` rolls all of them back.
 */
export interface CleanupUnitOfWork {
  readonly reads: {
    readonly mailboxFacts: MailboxFacts;
    readonly suggestions: SuggestionReader;
    readonly digestState: DigestStateReader;
  };
  run<T, E>(
    work: (tx: CleanupTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
