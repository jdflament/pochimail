import type {
  AccountReader,
  AccountRepository,
} from "@pochimail/accounts/ports/account-repository";
import type { AsyncResult, Page, PageRequest } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, MessageId, TopicId, WorkspaceId } from "@pochimail/kernel/ids";
import type { CursorReader, CursorRepository } from "@pochimail/mailbox/ports/cursor-repository";
import type { MessageReader, MessageRepository } from "@pochimail/mailbox/ports/message-repository";
import type { SenderReader, SenderRepository } from "@pochimail/mailbox/ports/sender-repository";
import type { ThreadReader, ThreadRepository } from "@pochimail/mailbox/ports/thread-repository";
import type { ActionLog, Suggestion } from "../domain/action.ts";
import type { DerivedMessage } from "../domain/derived.ts";
import type { StoredSignal, Topic } from "../domain/mail.ts";
import type { ActionId, ActionLogId, SuggestionId } from "../ids.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped (AGENTS §3).
// Each repository is split in a reader (usable anywhere) and a writer (only inside a UnitOfWork).

export interface DerivedReader {
  get(ws: WorkspaceId, id: MessageId): AsyncResult<DerivedMessage, StorageError | NotFound>;
  list(
    ws: WorkspaceId,
    accountId: AccountId,
    page: PageRequest,
  ): AsyncResult<Page<DerivedMessage>, StorageError>;
}
export interface DerivedWriter {
  /** One row per message: saving again replaces it, so a re-run changes nothing. */
  save(derived: DerivedMessage): AsyncResult<void, StorageError>;
}

export interface SuggestionReader {
  get(ws: WorkspaceId, id: SuggestionId): AsyncResult<Suggestion, StorageError | NotFound>;
  listPending(ws: WorkspaceId, page: PageRequest): AsyncResult<Page<Suggestion>, StorageError>;
}
export interface SuggestionWriter {
  save(suggestion: Suggestion): AsyncResult<void, StorageError>;
}

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

export interface SignalReader {
  /** Stored signals of the given messages, sorted by message id then kind. */
  listForMessages(
    ws: WorkspaceId,
    messageIds: readonly MessageId[],
  ): AsyncResult<readonly StoredSignal[], StorageError>;
}
export interface SignalWriter {
  /**
   * One row per message and signal kind. Replaces every stored signal of `messageIds` with
   * `signals`, so a signal that no longer applies disappears and a re-run changes nothing.
   */
  replaceForMessages(
    ws: WorkspaceId,
    messageIds: readonly MessageId[],
    signals: readonly StoredSignal[],
  ): AsyncResult<void, StorageError>;
}

export interface DigestStateReader {
  /** When the last digest of the account was generated; `null` before the first one. */
  get(ws: WorkspaceId, accountId: AccountId): AsyncResult<string | null, StorageError>;
  /** The ingest sequence the last digest covered up to; 0 before the first one. */
  getSequence(ws: WorkspaceId, accountId: AccountId): AsyncResult<number, StorageError>;
}
export interface DigestStateWriter {
  /** `lastSequence` is the newest ingest sequence the digest covered (default 0). */
  set(
    ws: WorkspaceId,
    accountId: AccountId,
    lastDigestAt: string,
    lastSequence?: number,
  ): AsyncResult<void, StorageError>;
}

export type DerivedRepository = DerivedReader & DerivedWriter;
export type SuggestionRepository = SuggestionReader & SuggestionWriter;
export type ActionLogRepository = ActionLogReader & ActionLogWriter;
export type TopicRepository = TopicReader & TopicWriter;
export type SignalRepository = SignalReader & SignalWriter;
export type DigestStateRepository = DigestStateReader & DigestStateWriter;

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
