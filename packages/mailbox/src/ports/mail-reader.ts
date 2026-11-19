import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { MessageId } from "@pochimail/kernel/ids";
import type { IncomingMessage } from "../model/message.ts";

/** Opaque, provider-specific position in a mailbox (history id, delta token, UID range). */
export interface SyncCursor {
  /** Distinguishes several cursors of one account (e.g. one Graph delta token per folder). */
  readonly scope: string;
  readonly token: string;
}

export interface SyncBatch {
  readonly messages: readonly IncomingMessage[];
  readonly nextCursor: SyncCursor;
  readonly hasMore: boolean;
  /** `true` when the stored cursor expired and this batch restarts from a full walk. */
  readonly restarted: boolean;
}

/** What the mailbox needs from a provider: mail in, by cursor, and a body on demand. */
export interface MailReader<E extends Error = Error> {
  /** Headers and metadata only; bodies are fetched on demand. `null` cursor starts a backfill. */
  sync(cursor: SyncCursor | null, signal: CancelSignal): AsyncResult<SyncBatch, E>;
  /** Plain text body, fetched lazily. Never rendered as remote content. */
  fetchBody(messageId: MessageId, signal: CancelSignal): AsyncResult<string, E>;
}
