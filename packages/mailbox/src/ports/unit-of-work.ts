import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import type { Result } from "@pochimail/kernel/result";
import type { CursorReader, CursorRepository } from "./cursor-repository.ts";
import type { MessageReader, MessageRepository } from "./message-repository.ts";
import type { SenderReader, SenderRepository } from "./sender-repository.ts";
import type { ThreadReader, ThreadRepository } from "./thread-repository.ts";

/** Only exists inside `MailboxUnitOfWork.run`: the sole way to write mailbox rows or publish events. */
export interface MailboxTransaction {
  readonly repositories: {
    readonly messages: MessageRepository;
    readonly threads: ThreadRepository;
    readonly senders: SenderRepository;
    readonly cursors: CursorRepository;
  };
  readonly events: EventSink;
}

/**
 * Message, thread, sender and cursor writes and their events commit atomically: `work` returning
 * `ok` commits all of them; `err`, a throw or an aborted `signal` rolls all of them back.
 */
export interface MailboxUnitOfWork {
  readonly reads: {
    readonly messages: MessageReader;
    readonly threads: ThreadReader;
    readonly senders: SenderReader;
    readonly cursors: CursorReader;
  };
  run<T, E>(
    work: (tx: MailboxTransaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled>;
}
