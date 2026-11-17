import type { StorageError } from "../errors.ts";
import type { AsyncResult } from "./common.ts";

/** Counts only: names and subjects never go into a notification unless the user opts in. */
export interface Notification {
  readonly kind: "digest-ready" | "scan-complete" | "review-waiting";
  readonly count: number;
}

export interface Notifier {
  notify(notification: Notification): AsyncResult<void, StorageError>;
}
