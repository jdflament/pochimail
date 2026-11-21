import type { AsyncResult, Page } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, MessageId, WorkspaceId } from "@pochimail/kernel/ids";

/** One stored message as plain data: the label is an opaque string owned by classification. */
export interface MessageFact {
  readonly id: MessageId;
  readonly from: string;
  readonly category: string;
  readonly receivedAt: string;
  readonly opened: boolean;
  readonly hasListUnsubscribe: boolean;
}

export interface MessageFactsQuery {
  readonly accountId: AccountId;
  readonly limit: number;
  readonly cursor?: string;
  /** Only messages stored after this ingest sequence. */
  readonly afterSequence?: number;
  /** Only messages stored up to this ingest sequence. */
  readonly throughSequence?: number;
}

/** A signal found on a message; the kind is a label owned by classification. */
export interface SignalFact {
  readonly messageId: MessageId;
  readonly kind: string;
}

/** The decision recorded for a message: why it was classified as it was. */
export interface DecisionFact {
  readonly messageId: MessageId;
  readonly reason: string;
  readonly confidence: number;
}

/** What cleanup reads about mail, as plain data. The adapter maps it from the other domains' rows. */
export interface MailboxFacts {
  accountIds(ws: WorkspaceId): AsyncResult<readonly AccountId[], StorageError>;
  /** Newest first, like the mailbox listing. */
  query(ws: WorkspaceId, q: MessageFactsQuery): AsyncResult<Page<MessageFact>, StorageError>;
  /** The newest ingest sequence of the account; 0 when it has no mail. */
  latestSequence(ws: WorkspaceId, accountId: AccountId): AsyncResult<number, StorageError>;
  /** The decisions recorded for these messages; a message without one is left out. */
  decisions(
    ws: WorkspaceId,
    ids: readonly MessageId[],
  ): AsyncResult<readonly DecisionFact[], StorageError | NotFound>;
  /** The signals of these messages of the account at `now`, in message id order. */
  signals(
    ws: WorkspaceId,
    accountId: AccountId,
    ids: readonly MessageId[],
    now: Date,
  ): AsyncResult<readonly SignalFact[], StorageError | NotFound>;
}
