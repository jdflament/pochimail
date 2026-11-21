import { EvaluateSignals } from "@pochimail/classification/use-cases/evaluate-signals";
import type { MailboxFacts } from "@pochimail/cleanup/ports/mailbox-facts";
import { ok } from "@pochimail/kernel/result";
import type { ReadRepositories } from "../ports/repositories.ts";
import { signalFactsOver } from "./signal-facts.ts";

type Reads = Omit<ReadRepositories, "mailboxFacts" | "signalFacts">;

/**
 * Composition until `workflows` exists: cleanup's plain-data view of the mailbox, read from the
 * accounts, mailbox and derived rows, with signals evaluated by classification. Every adapter
 * (SQLite, in-memory) builds it the same way.
 */
export function mailboxFactsOver(reads: Reads): MailboxFacts {
  const evaluate = new EvaluateSignals({
    signalFacts: signalFactsOver(reads),
    derived: reads.derived,
  });
  return {
    async accountIds(ws) {
      const accounts = await reads.accounts.list(ws);
      return accounts.ok ? ok(accounts.value.map((a) => a.id)) : accounts;
    },
    async query(ws, q) {
      const page = await reads.messages.query(ws, q);
      if (!page.ok) return page;
      return ok({
        items: page.value.items.map((m) => ({
          id: m.id,
          from: m.from,
          category: m.category,
          receivedAt: m.receivedAt,
          opened: m.opened,
          hasListUnsubscribe: m.hasListUnsubscribe,
        })),
        nextCursor: page.value.nextCursor,
      });
    },
    latestSequence: (ws, accountId) => reads.messages.latestSequence(ws, accountId),
    async decisions(ws, ids) {
      const out = [];
      for (const id of ids) {
        const derived = await reads.derived.get(ws, id);
        if (!derived.ok && derived.error.code !== "storage.not_found") return derived;
        if (derived.ok)
          out.push({
            messageId: id,
            reason: derived.value.reason,
            confidence: derived.value.confidence,
          });
      }
      return ok(out);
    },
    async signals(ws, accountId, ids, now) {
      const found = await evaluate.execute({ workspaceId: ws, accountId, messageIds: ids }, now);
      return found.ok
        ? ok(found.value.map((s) => ({ messageId: s.messageId, kind: s.kind })))
        : found;
    },
  };
}
