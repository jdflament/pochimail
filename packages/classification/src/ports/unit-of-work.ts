import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { DerivedReader, DerivedRepository } from "./derived-repository.ts";
import type { MessageLabeler, MessageSource, SignalFactsSource } from "./message-source.ts";
import type { SignalReader, SignalRepository } from "./signal-repository.ts";
import type { TopicReader, TopicRepository } from "./topic-repository.ts";

/** Only exists inside `ClassificationUnitOfWork.run`: the sole way to write derived rows or events. */
export interface ClassificationTransaction {
  readonly repositories: {
    readonly derived: DerivedRepository;
    readonly signals: SignalRepository;
    readonly messages: MessageLabeler;
    readonly topics: TopicRepository;
  };
  readonly events: EventSink;
}

/**
 * Derived rows, signals, the message label and their events commit atomically: `work` returning
 * `ok` commits all of them; `err`, a throw or an aborted `signal` rolls all of them back.
 */
export interface ClassificationUnitOfWork {
  readonly reads: {
    readonly derived: DerivedReader;
    readonly signals: SignalReader;
    readonly topics: TopicReader;
    readonly messages: MessageSource;
    readonly signalFacts: SignalFactsSource;
  };
  run<T, E>(
    work: (tx: ClassificationTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
