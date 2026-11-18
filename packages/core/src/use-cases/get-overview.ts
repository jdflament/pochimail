import type { Clock } from "../clock.ts";
import type { Category } from "../domain/category.ts";
import type { NotFound, StorageError } from "../errors.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";
import { ListAccounts } from "./list-accounts.ts";
import { SummarizeMailbox } from "./summarize-mailbox.ts";

/** Categories Pochi may propose to clean. People, records and purchases are never listed (brief §7 item 4). */
export const CLEANABLE_CATEGORIES = [
  "newsletters",
  "promotions",
  "notifications",
  "sign-ins-security",
] as const satisfies readonly Category[];
export type CleanableCategory = (typeof CLEANABLE_CATEGORIES)[number];

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
  readonly cleanable: readonly { readonly category: CleanableCategory; readonly count: number }[];
}

/** The figures the Overview leads with, computed from what the scan stored, for all accounts or one. */
export class GetOverview {
  constructor(private readonly deps: { readonly uow: UnitOfWork; readonly clock: Clock }) {}

  async execute(
    workspaceId: WorkspaceId,
    accountId?: AccountId,
  ): AsyncResult<OverviewNumbers, StorageError | NotFound> {
    const accounts = await new ListAccounts(this.deps).execute(workspaceId);
    if (!accounts.ok) return accounts;
    const ids = accounts.value
      .map((a) => a.id)
      .filter((id) => accountId === undefined || id === accountId);
    const summary = await new SummarizeMailbox(this.deps).execute({ workspaceId, accountIds: ids });
    if (!summary.ok) return summary;
    const { signals, categories } = summary.value;
    const waiting = signals["needs-reply"];
    const deadlines = signals["time-sensitive"];
    const important = signals["important-sender"];
    return ok({
      scanned: summary.value.emails,
      toReview: waiting + deadlines + important,
      waiting,
      deadlines,
      important,
      oldestWaitingDays: summary.value.oldestWaitingDays,
      cleanable: CLEANABLE_CATEGORIES.map((category) => ({ category, count: categories[category] }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count),
    });
  }
}
