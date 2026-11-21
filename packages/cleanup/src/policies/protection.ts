/**
 * Labels whose mail is never proposed for cleanup (brief §2 invariants; ADR 0012). The labels
 * are classification's; this domain only decides what to do with them.
 */
export const PROTECTED_LABELS: readonly string[] = ["people"];

export const isProtectedLabel = (label: string): boolean => PROTECTED_LABELS.includes(label);
