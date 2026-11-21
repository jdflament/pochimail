import type { ActionKind } from "../model/action.ts";

/** Brief §2, question 2: how much the assistant may do on its own. */
export const AUTONOMY_LEVELS = ["just-look", "suggest", "autopilot"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/**
 * Autopilot acts only at or above this confidence (brief §2: "high threshold"). 0.9 is a
 * default (docs/plan.md D9), to be tuned against the eval set.
 */
export const AUTOPILOT_CONFIDENCE_THRESHOLD = 0.9;

/**
 * Every action kind must be classified: `Record<ActionKind, …>` makes a new kind fail typecheck
 * until someone decides whether Autopilot may ever apply it. Brief §2 allows only unsubscribe
 * and archive; trash (ADR 0012), undo and local bookkeeping kinds always wait for the user.
 */
export const AUTOPILOT_ELIGIBLE: Record<ActionKind, boolean> = {
  archive: true,
  unsubscribe: true,
  "apply-label": false,
  unarchive: false,
  trash: false,
  untrash: false,
  "remove-label": false,
  "mark-handled": false,
  "unmark-handled": false,
};

export function isActionKind(kind: string): kind is ActionKind {
  return Object.hasOwn(AUTOPILOT_ELIGIBLE, kind);
}
