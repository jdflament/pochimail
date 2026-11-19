import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import type { Account } from "../domain/account.ts";
import type { ActionLog, Suggestion } from "../domain/action.ts";
import type { Category } from "../domain/category.ts";
import type { DerivedMessage } from "../domain/derived.ts";
import type {
  IncomingMessage,
  Message,
  SenderStats,
  StoredSignal,
  Thread,
  Topic,
} from "../domain/mail.ts";
import type { NotFound } from "../errors.ts";
import type {
  AccountId,
  ActionId,
  ActionLogId,
  MessageId,
  SuggestionId,
  ThreadId,
  TopicId,
} from "../ids.ts";
import type { Page, PageRequest } from "./common.ts";
import type { SyncCursor } from "./mail-provider.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped (AGENTS §3).
// Each repository is split in a reader (usable anywhere) and a writer (only inside a UnitOfWork).

export interface AccountReader {
  get(ws: WorkspaceId, id: AccountId): AsyncResult<Account, StorageError | NotFound>;
  list(ws: WorkspaceId): AsyncResult<readonly Account[], StorageError>;
}
export interface AccountWriter {
  save(account: Account): AsyncResult<void, StorageError>;
  /**
   * Deletes the account and every row that belongs to it (messages, threads, derived data,
   * signals, senders, suggestions, cursors, digest state). Nothing of another account changes.
   * The action log is the append-only audit trail and stays.
   */
  remove(ws: WorkspaceId, id: AccountId): AsyncResult<void, StorageError>;
}

export interface MessageQuery extends PageRequest {
  readonly accountId: AccountId;
  readonly category?: Category;
  readonly senderAddress?: string;
  /** Only messages stored after this ingest sequence (see `latestSequence`). */
  readonly afterSequence?: number;
  /** Only messages stored up to and including this ingest sequence. */
  readonly throughSequence?: number;
}
export interface MessageReader {
  get(ws: WorkspaceId, id: MessageId): AsyncResult<Message, StorageError | NotFound>;
  query(
    ws: WorkspaceId,
    query: MessageQuery,
    signal?: CancelSignal,
  ): AsyncResult<Page<Message>, StorageError>;
  /**
   * The ingest sequence of the last message stored for the account (0 when none). It grows with
   * every first insert, whatever the message's own date, so "stored since" never misses late mail.
   */
  latestSequence(ws: WorkspaceId, accountId: AccountId): AsyncResult<number, StorageError>;
  /** Emails per category over the given accounts, one aggregate read (every category present, 0 when empty). */
  countByCategory(
    ws: WorkspaceId,
    accountIds: readonly AccountId[],
  ): AsyncResult<Readonly<Record<Category, number>>, StorageError>;
}
export interface MessageWriter {
  /** Inserts or updates by id; a re-run with the same input changes nothing (idempotent). */
  upsertMany(
    messages: readonly IncomingMessage[],
    signal?: CancelSignal,
  ): AsyncResult<void, StorageError>;
  setCategory(
    ws: WorkspaceId,
    id: MessageId,
    category: Category,
  ): AsyncResult<void, StorageError | NotFound>;
}

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

export interface ThreadReader {
  get(ws: WorkspaceId, id: ThreadId): AsyncResult<Thread, StorageError | NotFound>;
}
export interface ThreadWriter {
  upsert(thread: Thread): AsyncResult<void, StorageError>;
}

export interface SenderReader {
  get(
    ws: WorkspaceId,
    accountId: AccountId,
    address: string,
  ): AsyncResult<SenderStats, StorageError | NotFound>;
  list(
    ws: WorkspaceId,
    accountId: AccountId,
    page: PageRequest,
  ): AsyncResult<Page<SenderStats>, StorageError>;
}
export interface SenderWriter {
  upsert(stats: SenderStats): AsyncResult<void, StorageError>;
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

export interface CursorReader {
  /** `null` when no cursor is stored yet (start a backfill). */
  get(
    ws: WorkspaceId,
    accountId: AccountId,
    scope: string,
  ): AsyncResult<SyncCursor | null, StorageError>;
}
export interface CursorWriter {
  set(ws: WorkspaceId, accountId: AccountId, cursor: SyncCursor): AsyncResult<void, StorageError>;
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

export type AccountRepository = AccountReader & AccountWriter;
export type MessageRepository = MessageReader & MessageWriter;
export type DerivedRepository = DerivedReader & DerivedWriter;
export type ThreadRepository = ThreadReader & ThreadWriter;
export type SenderRepository = SenderReader & SenderWriter;
export type SuggestionRepository = SuggestionReader & SuggestionWriter;
export type ActionLogRepository = ActionLogReader & ActionLogWriter;
export type TopicRepository = TopicReader & TopicWriter;
export type CursorRepository = CursorReader & CursorWriter;
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
