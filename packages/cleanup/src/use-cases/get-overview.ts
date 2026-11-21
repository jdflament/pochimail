import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, WorkspaceId } from "@pochimail/kernel/ids";
import { ok } from "@pochimail/kernel/result";
import { CLEANABLE_LABELS, type CleanableLabel } from "../policies/labels.ts";
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
  /** Emails Pochi could propose to clean, per category, largest first; empty categories are left out. */
  readonly cleanable: readonly { readonly category: CleanableLabel; readonly count: number }[];
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
    const { signals, categories } = summary.value;
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
      cleanable: CLEANABLE_LABELS.map((category) => ({
        category,
        count: categories[category] ?? 0,
      }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count),
    });
  }
}
