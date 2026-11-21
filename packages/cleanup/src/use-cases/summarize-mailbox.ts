import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult } from "@pochimail/kernel/common";
import type { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { AccountId, MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import { ok } from "@pochimail/kernel/result";
import {
  type CleanUpAction,
  cleanUpActions,
  type FactWithSignals,
} from "../policies/clean-up-actions.ts";
import type { MessageFact } from "../ports/mailbox-facts.ts";
import type { CleanupUnitOfWork } from "../ports/unit-of-work.ts";

const PAGE = 500;
const DAY_MS = 86_400_000;

export interface SummarizeMailboxRequest {
  readonly workspaceId: WorkspaceId;
  readonly accountIds: readonly AccountId[];
}

/** Counts only: never a subject, address or snippet (brief §5.10). Labels with no email are absent. */
export interface MailboxSummary {
  readonly accounts: number;
  readonly emails: number;
  readonly categories: Readonly<Record<string, number>>;
  /** Emails per signal kind (a message may carry several). */
  readonly signals: Readonly<Record<string, number>>;
  /** Age in whole days of the oldest email still needing a reply; 0 when none. */
  readonly oldestWaitingDays: number;
  /** The Clean up proposals (ADR 0012), rows with nothing to propose left out. */
  readonly actions: readonly CleanUpAction[];
  /** Bytes over all emails; null while any size is unverified. */
  readonly totalBytes: number | null;
}

/** The mock-dataset summary (brief §6 › Mock data) computed from what the pipeline stored. */
export class SummarizeMailbox {
  constructor(private readonly deps: { readonly uow: CleanupUnitOfWork; readonly clock: Clock }) {}

  async execute(
    request: SummarizeMailboxRequest,
  ): AsyncResult<MailboxSummary, StorageError | NotFound> {
    const { uow, clock } = this.deps;
    const categories: Record<string, number> = {};
    const signals: Record<string, number> = {};
    let emails = 0;
    let oldestWaiting = 0;
    const rows: FactWithSignals[] = [];
    for (const accountId of request.accountIds) {
      const ids: MessageId[] = [];
      const received = new Map<MessageId, string>();
      const accountFacts: MessageFact[] = [];
      let cursor: string | undefined;
      do {
        const page = await uow.reads.mailboxFacts.query(request.workspaceId, {
          accountId,
          limit: PAGE,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (!page.ok) return page;
        for (const m of page.value.items) {
          ids.push(m.id);
          accountFacts.push(m);
          received.set(m.id, m.receivedAt);
          categories[m.category] = (categories[m.category] ?? 0) + 1;
        }
        cursor = page.value.nextCursor ?? undefined;
      } while (cursor !== undefined);
      emails += ids.length;

      const found = await uow.reads.mailboxFacts.signals(
        request.workspaceId,
        accountId,
        ids,
        clock.now(),
      );
      if (!found.ok) return found;
      const kindsOf = new Map<MessageId, Set<string>>();
      for (const s of found.value) {
        kindsOf.set(s.messageId, (kindsOf.get(s.messageId) ?? new Set()).add(s.kind));
        signals[s.kind] = (signals[s.kind] ?? 0) + 1;
        if (s.kind === "needs-reply") {
          const days = Math.floor(
            (clock.now().getTime() - Date.parse(received.get(s.messageId) ?? "")) / DAY_MS,
          );
          oldestWaiting = Math.max(oldestWaiting, days);
        }
      }
      for (const fact of accountFacts)
        rows.push({ fact, kinds: kindsOf.get(fact.id) ?? new Set() });
    }
    const sizes = rows.map((r) => r.fact.size);
    return ok({
      accounts: request.accountIds.length,
      emails,
      categories,
      signals,
      oldestWaitingDays: oldestWaiting,
      actions: cleanUpActions(rows, clock.now()),
      totalBytes: sizes.some((n) => n === null)
        ? null
        : sizes.reduce<number>((a, n) => a + (n ?? 0), 0),
    });
  }
}
