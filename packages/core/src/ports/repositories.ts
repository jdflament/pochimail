import type {
  AccountReader,
  AccountRepository,
} from "@pochimail/accounts/ports/account-repository";
import type {
  DerivedReader,
  DerivedRepository,
} from "@pochimail/classification/ports/derived-repository";
import type { SignalFactsSource } from "@pochimail/classification/ports/message-source";
import type {
  SignalReader,
  SignalRepository,
} from "@pochimail/classification/ports/signal-repository";
import type {
  DigestStateReader,
  DigestStateRepository,
} from "@pochimail/cleanup/ports/digest-state-repository";
import type { MailboxFacts } from "@pochimail/cleanup/ports/mailbox-facts";
import type {
  SuggestionReader,
  SuggestionRepository,
} from "@pochimail/cleanup/ports/suggestion-repository";
import type { AsyncResult, Page, PageRequest } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { TopicId, WorkspaceId } from "@pochimail/kernel/ids";
import type { CursorReader, CursorRepository } from "@pochimail/mailbox/ports/cursor-repository";
import type { MessageReader, MessageRepository } from "@pochimail/mailbox/ports/message-repository";
import type { SenderReader, SenderRepository } from "@pochimail/mailbox/ports/sender-repository";
import type { ThreadReader, ThreadRepository } from "@pochimail/mailbox/ports/thread-repository";
import type { ActionLog } from "../domain/action.ts";
import type { Topic } from "../domain/mail.ts";
import type { ActionId, ActionLogId } from "../ids.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped (AGENTS §3).
// Each repository is split in a reader (usable anywhere) and a writer (only inside a UnitOfWork).

export interface ActionLogReader {
  get(ws: WorkspaceId, id: ActionLogId): AsyncResult<ActionLog, StorageError | NotFound>;
  listForAction(
    ws: WorkspaceId,
    actionId: ActionId,
  ): AsyncResult<readonly ActionLog[], StorageError>;
  /** Every entry (applied, failed, refused) recorded for the key, oldest first. */
  listForKey(
    ws: WorkspaceId,
    idempotencyKey: string,
  ): AsyncResult<readonly ActionLog[], StorageError>;
  /** Every entry of a batch, oldest first, so undo can reverse the whole batch after a restart. */
  listForBatch(ws: WorkspaceId, batchId: string): AsyncResult<readonly ActionLog[], StorageError>;
  list(ws: WorkspaceId, page: PageRequest): AsyncResult<Page<ActionLog>, StorageError>;
}
export interface ActionLogWriter {
  /** The log is append-only: undo appends an `undone` entry, it never edits or removes one. */
  append(entry: ActionLog): AsyncResult<void, StorageError>;
}

export interface TopicReader {
  get(ws: WorkspaceId, id: TopicId): AsyncResult<Topic, StorageError | NotFound>;
  list(ws: WorkspaceId): AsyncResult<readonly Topic[], StorageError>;
}
export interface TopicWriter {
  save(topic: Topic): AsyncResult<void, StorageError>;
}

export type ActionLogRepository = ActionLogReader & ActionLogWriter;
export type TopicRepository = TopicReader & TopicWriter;

export interface ReadRepositories {
  readonly accounts: AccountReader;
  readonly messages: MessageReader;
  readonly threads: ThreadReader;
  readonly derived: DerivedReader;
  readonly senders: SenderReader;
  readonly suggestions: SuggestionReader;
  readonly actionLog: ActionLogReader;
  readonly topics: TopicReader;
  readonly cursors: CursorReader;
  readonly signals: SignalReader;
  readonly digestState: DigestStateReader;
  readonly signalFacts: SignalFactsSource;
  readonly mailboxFacts: MailboxFacts;
}

export interface WriteRepositories {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly derived: DerivedRepository;
  readonly senders: SenderRepository;
  readonly suggestions: SuggestionRepository;
  readonly actionLog: ActionLogRepository;
  readonly topics: TopicRepository;
  readonly cursors: CursorRepository;
  readonly signals: SignalRepository;
  readonly digestState: DigestStateRepository;
}
