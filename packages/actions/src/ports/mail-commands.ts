import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { type Cancelled, type DomainError, ProviderError } from "@pochimail/kernel/errors";
import type { Command } from "../model/action.ts";

/** Gmail organizes with labels; Graph with folders. */
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
  /** `true`: the provider can wake the app (a push channel) instead of only being polled. */
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

/** What actions needs from a provider: apply commands and say what it can do. */
export interface MailCommands {
  readonly capabilities: MailProviderCapabilities;
  /** Applies commands in order. Providers without `batchModify` may loop; callers chunk by capability. */
  applyCommands(
    commands: readonly Command[],
    signal: CancelSignal,
  ): AsyncResult<readonly AppliedCommand[], MailProviderError>;
}

/**
 * A provider call that failed (or was cancelled) part-way. What already happened is listed with
 * its inverse, so none of it loses its undo. `code` and `message` are the failure's; `failure`
 * is the failure itself.
 */
export class PartiallyApplied extends ProviderError {
  readonly applied: readonly AppliedCommand[];
  readonly failure: DomainError;

  constructor(failure: DomainError, applied: readonly AppliedCommand[]) {
    super(failure.code, failure.message, { cause: failure });
    this.failure = failure;
    this.applied = applied;
  }
}
