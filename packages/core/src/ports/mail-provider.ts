import type { Command } from "../domain/action.ts";
import type { IncomingMessage } from "../domain/mail.ts";
import type { Cancelled, ProviderError } from "../errors.ts";
import type { MessageId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";

/** Gmail organizes with labels; Graph and IMAP with folders. */
export const ORGANIZATION_MODELS = ["labels", "folders"] as const;
export type OrganizationModel = (typeof ORGANIZATION_MODELS)[number];

/** How "archive" is carried out: drop the inbox label, or move to an archive folder. */
export const ARCHIVE_SEMANTICS = ["remove-inbox-label", "move-to-archive-folder"] as const;
export type ArchiveSemantics = (typeof ARCHIVE_SEMANTICS)[number];

/**
 * What a provider can do. Use cases branch on these, never on the provider kind (ADR 0004).
 * There is deliberately no provider name here.
 */
export interface MailProviderCapabilities {
  readonly organization: OrganizationModel;
  readonly archive: ArchiveSemantics;
  /** `null`: one command per call. Otherwise the largest batch the provider accepts. */
  readonly batchModify: { readonly maxCommands: number } | null;
  /** `true`: true delta sync (history id / delta token / QRESYNC). `false`: full or UID-range walk. */
  readonly deltaSync: boolean;
  /** `true`: the provider can wake the app (IMAP IDLE) instead of only being polled. */
  readonly pushWakeups: boolean;
  /** `true`: RFC 8058 one-click unsubscribe can be sent. */
  readonly unsubscribeSend: boolean;
}

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

/** What a command really did, so the action log can store an inverse for undo. */
export interface AppliedCommand {
  readonly command: Command;
  readonly inverse: Command | null;
}

export type MailProviderError = ProviderError | Cancelled;

export interface MailProvider {
  readonly capabilities: MailProviderCapabilities;
  /** Headers and metadata only; bodies are fetched on demand. `null` cursor starts a backfill. */
  sync(cursor: SyncCursor | null, signal: CancelSignal): AsyncResult<SyncBatch, MailProviderError>;
  /** Applies commands in order. Providers without `batchModify` may loop; callers chunk by capability. */
  applyCommands(
    commands: readonly Command[],
    signal: CancelSignal,
  ): AsyncResult<readonly AppliedCommand[], MailProviderError>;
  /** Plain text body, fetched lazily. Never rendered as remote content. */
  fetchBody(messageId: MessageId, signal: CancelSignal): AsyncResult<string, MailProviderError>;
}
