import type { Category, SignalKind } from "../model/category.ts";

const DAY_MS = 86_400_000;
/** A thread we answered stays quiet this long before it counts as "waiting on them". */
export const WAITING_AFTER_DAYS = 3;
/** Unopened mail older than this is "old and never opened". */
export const OLD_AFTER_DAYS = 30;
/** A sender we replied to this often is important even without a VIP mark. */
export const IMPORTANT_REPLY_COUNT = 3;

// Word lists are deliberately small; the generative layer refines them later (brief §3).
const DOCUMENT_WORDS =
  /\b(invoice|receipt|contract|payslip|passport|statement|tax|facture|contrat|bulletin de paie|justificatif)\b|請求書|契約|領収書|給与明細/i;
const DEADLINE_WORDS =
  /\b(deadline|due|expires?|expiry|expiring|urgent|tomorrow|today|échéance|expire|urgent|demain)\b|期限|締切|明日/i;

export interface RuleInput {
  readonly from: string;
  readonly receivedAt: string;
  readonly opened: boolean;
  readonly category: Category;
  readonly text: string;
  readonly ownerAddress: string;
  readonly now: Date;
  readonly lastInThread: boolean;
  readonly important: boolean;
}
export interface Hit {
  readonly kind: SignalKind;
  readonly confidence: number;
  readonly reason: string;
}

/** The six signals of one message (brief §3). Pure: the same input always gives the same hits. */
export function signalRules(i: RuleInput): Hit[] {
  const hits: Hit[] = [];
  const fromOwner = i.from.toLowerCase() === i.ownerAddress.toLowerCase();
  const ageDays = (i.now.getTime() - Date.parse(i.receivedAt)) / DAY_MS;

  if (i.category === "people" && i.lastInThread && !fromOwner)
    hits.push({
      kind: "needs-reply",
      confidence: 0.8,
      reason: "A person wrote last and you have not answered",
    });
  if (i.category === "people" && i.lastInThread && fromOwner && ageDays >= WAITING_AFTER_DAYS)
    hits.push({
      kind: "waiting-on-them",
      confidence: 0.8,
      reason: `You wrote last, ${WAITING_AFTER_DAYS}+ days ago, with no answer`,
    });
  if (i.important && !fromOwner)
    hits.push({
      kind: "important-sender",
      confidence: 0.9,
      reason: "You often reply to this sender or marked them VIP",
    });
  if (DOCUMENT_WORDS.test(i.text))
    hits.push({ kind: "has-document", confidence: 0.6, reason: "Looks like a document" });
  if (DEADLINE_WORDS.test(i.text))
    hits.push({ kind: "time-sensitive", confidence: 0.6, reason: "Mentions a deadline or expiry" });
  if (!i.opened && ageDays >= OLD_AFTER_DAYS)
    hits.push({
      kind: "old-never-opened",
      confidence: 0.95,
      reason: `Unopened for ${OLD_AFTER_DAYS}+ days`,
    });
  return hits;
}
