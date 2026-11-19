import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, ProviderError } from "@pochimail/kernel/errors";
import type { MailReader } from "@pochimail/mailbox/ports/mail-reader";
import type { Command } from "../domain/action.ts";

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

/** What a command really did, so the action log can store an inverse for undo. */
export interface AppliedCommand {
  readonly command: Command;
  readonly inverse: Command | null;
}

export type MailProviderError = ProviderError | Cancelled;

export interface MailProvider extends MailReader<MailProviderError> {
  readonly capabilities: MailProviderCapabilities;
  /** Applies commands in order. Providers without `batchModify` may loop; callers chunk by capability. */
  applyCommands(
    commands: readonly Command[],
    signal: CancelSignal,
  ): AsyncResult<readonly AppliedCommand[], MailProviderError>;
}
