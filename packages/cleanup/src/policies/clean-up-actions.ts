import type { MessageFact } from "../ports/mailbox-facts.ts";

export const CLEAN_UP_KINDS = ["delete", "archive", "unsubscribe", "save"] as const;
export type CleanUpKind = (typeof CLEAN_UP_KINDS)[number];

/**
 * One proposal of the Overview's Clean up section. `count` and `bytes` cover only emails that
 * would be pre-selected; emails with a protecting signal are left out and counted in
 * `protectedCount`. `bytes` is null (and `sizeKnown` false) while any size is unverified (ADR 0012).
 * For `unsubscribe`, `count` is senders; for `save`, emails carrying an unsaved document.
 */
export interface CleanUpAction {
  readonly kind: CleanUpKind;
  /** The category its Review screen opens. */
  readonly category: string;
  readonly count: number;
  readonly bytes: number | null;
  readonly protectedCount: number;
  readonly sizeKnown: boolean;
}

interface Rule {
  readonly kind: CleanUpKind;
  readonly category: string;
  readonly minAgeDays?: number;
  readonly maxAgeDays?: number;
  readonly neverOpened?: boolean;
}

/** In display order; the screens in docs/design/screens (ScanDelete) are the reference for each row. */
const RULES: readonly Rule[] = [
  { kind: "delete", category: "promotions", minAgeDays: 90, neverOpened: true },
  { kind: "delete", category: "notifications", minAgeDays: 90 },
  { kind: "delete", category: "sign-ins-security", minAgeDays: 90 },
  { kind: "unsubscribe", category: "newsletters" },
  { kind: "archive", category: "notifications", minAgeDays: 30, maxAgeDays: 90 },
  { kind: "save", category: "records" },
];

/** Signals that keep an email out of pre-selection (ADR 0012). */
const PROTECTING = ["needs-reply", "time-sensitive", "important-sender", "has-document"];
/** Stands in for the "written by a real person" signal until it exists (#100). */
const isProtected = (fact: MessageFact, kinds: ReadonlySet<string>): boolean =>
  fact.category === "people" || PROTECTING.some((k) => kinds.has(k));

const DAY_MS = 86_400_000;

export interface FactWithSignals {
  readonly fact: MessageFact;
  readonly kinds: ReadonlySet<string>;
}

const matches = (rule: Rule, { fact, kinds }: FactWithSignals, now: number): boolean => {
  if (rule.kind === "save") return kinds.has("has-document");
  if (fact.category !== rule.category) return false;
  const age = (now - Date.parse(fact.receivedAt)) / DAY_MS;
  return (
    (rule.minAgeDays === undefined || age >= rule.minAgeDays) &&
    (rule.maxAgeDays === undefined || age < rule.maxAgeDays) &&
    (rule.neverOpened !== true || !fact.opened)
  );
};

const cleanUpAction = (
  rule: Rule,
  rows: readonly FactWithSignals[],
  now: number,
): CleanUpAction => {
  let chosen = rows.filter((row) => matches(rule, row, now));
  if (rule.kind === "unsubscribe") {
    const opened = new Set(rows.filter((r) => r.fact.opened).map((r) => r.fact.from));
    chosen = chosen.filter((r) => r.fact.hasListUnsubscribe && !opened.has(r.fact.from));
  }
  const guarded = rule.kind === "delete" || rule.kind === "archive";
  const kept = guarded ? chosen.filter((r) => !isProtected(r.fact, r.kinds)) : chosen;
  const sizes = kept.map((r) => r.fact.size);
  const sizeKnown = sizes.every((s) => s !== null);
  return {
    kind: rule.kind,
    category: rule.category,
    count: rule.kind === "unsubscribe" ? new Set(kept.map((r) => r.fact.from)).size : kept.length,
    bytes: sizeKnown ? sizes.reduce<number>((sum, s) => sum + (s ?? 0), 0) : null,
    protectedCount: chosen.length - kept.length,
    sizeKnown,
  };
};

/** The Clean up proposals over the stored mail, rows with nothing to propose left out. */
export const cleanUpActions = (
  rows: readonly FactWithSignals[],
  now: Date,
): readonly CleanUpAction[] =>
  RULES.map((rule) => cleanUpAction(rule, rows, now.getTime())).filter(
    (a) => a.count > 0 || a.protectedCount > 0,
  );
