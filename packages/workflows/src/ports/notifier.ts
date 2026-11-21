import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";

/** Counts only: names and subjects never go into a notification unless the user opts in. */
export interface Notification {
  readonly kind: "digest-ready" | "scan-complete" | "review-waiting";
  readonly count: number;
}

export interface Notifier {
  notify(notification: Notification): AsyncResult<void, StorageError>;
}
