import type { Account } from "../domain/account.ts";
import type { ActionLog, Suggestion } from "../domain/action.ts";
import type { Category } from "../domain/category.ts";
import type { IncomingMessage, Message, SenderStats, Thread, Topic } from "../domain/mail.ts";
import type { NotFound, StorageError } from "../errors.ts";
import type {
  AccountId,
  ActionId,
  ActionLogId,
  MessageId,
  SuggestionId,
  ThreadId,
  TopicId,
  WorkspaceId,
} from "../ids.ts";
import type { AsyncResult, CancelSignal, Page, PageRequest } from "./common.ts";
import type { SyncCursor } from "./mail-provider.ts";

// Every method takes the workspaceId first: all reads and writes are workspace-scoped (AGENTS §3).
// Each repository is split in a reader (usable anywhere) and a writer (only inside a UnitOfWork).

export interface AccountReader {
  get(ws: WorkspaceId, id: AccountId): AsyncResult<Account, StorageError | NotFound>;
  list(ws: WorkspaceId): AsyncResult<readonly Account[], StorageError>;
}
export interface AccountWriter {
  save(account: Account): AsyncResult<void, StorageError>;
}

export interface MessageQuery extends PageRequest {
  readonly accountId: AccountId;
  readonly category?: Category;
  readonly senderAddress?: string;
}
export interface MessageReader {
  get(ws: WorkspaceId, id: MessageId): AsyncResult<Message, StorageError | NotFound>;
  query(
    ws: WorkspaceId,
    query: MessageQuery,
    signal?: CancelSignal,
  ): AsyncResult<Page<Message>, StorageError>;
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

export type AccountRepository = AccountReader & AccountWriter;
export type MessageRepository = MessageReader & MessageWriter;
export type ThreadRepository = ThreadReader & ThreadWriter;
export type SenderRepository = SenderReader & SenderWriter;
export type SuggestionRepository = SuggestionReader & SuggestionWriter;
export type ActionLogRepository = ActionLogReader & ActionLogWriter;
export type TopicRepository = TopicReader & TopicWriter;
export type CursorRepository = CursorReader & CursorWriter;

export interface ReadRepositories {
  readonly accounts: AccountReader;
  readonly messages: MessageReader;
  readonly threads: ThreadReader;
  readonly senders: SenderReader;
  readonly suggestions: SuggestionReader;
  readonly actionLog: ActionLogReader;
  readonly topics: TopicReader;
  readonly cursors: CursorReader;
}

export interface WriteRepositories {
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly threads: ThreadRepository;
  readonly senders: SenderRepository;
  readonly suggestions: SuggestionRepository;
  readonly actionLog: ActionLogRepository;
  readonly topics: TopicRepository;
  readonly cursors: CursorRepository;
}
