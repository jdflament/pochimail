import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import { ok } from "@pochimail/kernel/result";
import type { CleanUpAction } from "../policies/clean-up-actions.ts";
import type { CleanupUnitOfWork } from "../ports/unit-of-work.ts";
import { SummarizeMailbox } from "./summarize-mailbox.ts";

export interface OverviewNumbers {
  /** Emails stored over the selected accounts. */
  readonly scanned: number;
  /** Emails that need the person: waiting for a reply, with a deadline, or from an important sender. */
  readonly toReview: number;
  readonly waiting: number;
  readonly deadlines: number;
  readonly important: number;
  /** Age in whole days of the oldest email still waiting for a reply; 0 when none. */
  readonly oldestWaitingDays: number;
  /** The Clean up proposals in display order; the GB figure comes from the `delete` ones only. */
  readonly actions: readonly CleanUpAction[];
  /** Bytes over all emails; null while any size is unverified. */
  readonly totalBytes: number | null;
}

/** The figures the Overview leads with, computed from what the scan stored, for all accounts or one. */
export class GetOverview {
  constructor(private readonly deps: { readonly uow: CleanupUnitOfWork; readonly clock: Clock }) {}

  async execute(
    workspaceId: WorkspaceId,
    accountId?: AccountId,
  ): AsyncResult<OverviewNumbers, StorageError | NotFound> {
    const accounts = await this.deps.uow.reads.mailboxFacts.accountIds(workspaceId);
    if (!accounts.ok) return accounts;
    const ids = accounts.value.filter((id) => accountId === undefined || id === accountId);
    const summary = await new SummarizeMailbox(this.deps).execute({ workspaceId, accountIds: ids });
    if (!summary.ok) return summary;
    const { signals } = summary.value;
    const waiting = signals["needs-reply"] ?? 0;
    const deadlines = signals["time-sensitive"] ?? 0;
    const important = signals["important-sender"] ?? 0;
    return ok({
      scanned: summary.value.emails,
      toReview: waiting + deadlines + important,
      waiting,
      deadlines,
      important,
      oldestWaitingDays: summary.value.oldestWaitingDays,
      actions: summary.value.actions,
      totalBytes: summary.value.totalBytes,
    });
  }
}
