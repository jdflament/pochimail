import type { Clock } from "../clock.ts";
import { CATEGORIES, type Category, SIGNAL_KINDS, type SignalKind } from "../domain/category.ts";
import type { NotFound, StorageError } from "../errors.ts";
import type { AccountId, MessageId, WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "../ports/common.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { ok } from "../result.ts";
import { evaluateSignals } from "./detect-signals.ts";

const PAGE = 500;
const DAY_MS = 86_400_000;

export interface SummarizeMailboxRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountIds: readonly AccountId[];
}

/** Counts only: never a subject, address or snippet (brief §5.10). */
export interface MailboxSummary {
  readonly accounts: number;
  readonly emails: number;
  readonly categories: Readonly<Record<Category, number>>;
  /** Emails per signal kind (a message may carry several). */
  readonly signals: Readonly<Record<SignalKind, number>>;
  /** Age in whole days of the oldest email still needing a reply; 0 when none. */
  readonly oldestWaitingDays: number;
}

/** The mock-dataset summary (brief §6 › Mock data) computed from what the pipeline stored. */
export class SummarizeMailbox {
  constructor(private readonly deps: { readonly uow: UnitOfWork; readonly clock: Clock }) {}

  async execute(
    request: SummarizeMailboxRequest,
  ): AsyncResult<MailboxSummary, StorageError | NotFound> {
    const { uow, clock } = this.deps;
    const categories = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
      Category,
      number
    >;
    const signals = Object.fromEntries(SIGNAL_KINDS.map((k) => [k, 0])) as Record<
      SignalKind,
      number
    >;
    let emails = 0;
    let oldestWaiting = 0;
    for (const accountId of request.accountIds) {
      const ids: MessageId[] = [];
      const received = new Map<MessageId, string>();
      let cursor: string | undefined;
      do {
        const page = await uow.reads.messages.query(request.workspaceId, {
          accountId,
          limit: PAGE,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (!page.ok) return page;
        for (const m of page.value.items) {
          ids.push(m.id);
          received.set(m.id, m.receivedAt);
          categories[m.category] += 1;
        }
        cursor = page.value.nextCursor ?? undefined;
      } while (cursor !== undefined);
      emails += ids.length;

      const found = await evaluateSignals(uow.reads, clock, {
        workspaceId: request.workspaceId,
        accountId,
        messageIds: ids,
      });
      if (!found.ok) return found;
      for (const s of found.value) {
        signals[s.kind] += 1;
        if (s.kind === "needs-reply") {
          const days = Math.floor(
            (clock.now().getTime() - Date.parse(received.get(s.messageId) ?? "")) / DAY_MS,
          );
          oldestWaiting = Math.max(oldestWaiting, days);
        }
      }
    }
    return ok({
      accounts: request.accountIds.length,
      emails,
      categories,
      signals,
      oldestWaitingDays: oldestWaiting,
    });
  }
}
