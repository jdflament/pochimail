import type { Clock } from "../clock.ts";
import type { NotFound, StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";
import { ListAccounts } from "./list-accounts.ts";
import { SummarizeMailbox } from "./summarize-mailbox.ts";

export interface OverviewNumbers {
  /** Emails stored across all accounts. */
  readonly scanned: number;
  /** Emails that need the person: waiting for a reply, with a deadline, or from an important sender. */
  readonly toReview: number;
}

/** The two figures the Overview leads with, computed from what the scan stored. */
export class GetOverview {
  constructor(private readonly deps: { readonly uow: UnitOfWork; readonly clock: Clock }) {}

  async execute(workspaceId: WorkspaceId): AsyncResult<OverviewNumbers, StorageError | NotFound> {
    const accounts = await new ListAccounts(this.deps).execute(workspaceId);
    if (!accounts.ok) return accounts;
    const summary = await new SummarizeMailbox(this.deps).execute({
      workspaceId,
      accountIds: accounts.value.map((a) => a.id),
    });
    if (!summary.ok) return summary;
    const { signals } = summary.value;
    return ok({
      scanned: summary.value.emails,
      toReview: signals["needs-reply"] + signals["time-sensitive"] + signals["important-sender"],
    });
  }
}
