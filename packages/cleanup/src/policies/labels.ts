/** Labels the Overview counts as mail Pochi could propose to clean, in tie-break order. */
export const CLEANABLE_LABELS = [
  "newsletters",
  "promotions",
  "notifications",
  "sign-ins-security",
] as const;
export type CleanableLabel = (typeof CLEANABLE_LABELS)[number];

/** Labels where sender-level archive or unsubscribe may be proposed; everything else never is. */
export const PROPOSABLE_LABELS: readonly string[] = CLEANABLE_LABELS.filter(
  (label) => label !== "sign-ins-security",
);

/** Signals worth interrupting someone for; the rest stay in the Overview (brief §7). */
export const ATTENTION_SIGNALS: readonly string[] = [
  "needs-reply",
  "time-sensitive",
  "important-sender",
  "has-document",
];
