/**
 * Which required states are active, derived from worker events (M4-16). M2/M3/M8 only emit these
 * events; the UI never polls. Empty category and "Nothing to do" come from counts, not events.
 */
export type RequiredStateEvent =
  | { type: "Offline" }
  | { type: "Online" }
  | { type: "RateLimited"; provider: string; resumeAt: number }
  | { type: "SyncResumed" }
  | { type: "NeedsReauth"; accountId: string; provider: string }
  | { type: "Reconnected"; accountId: string }
  | { type: "SignInCancelled" }
  | { type: "SignInStarted" }
  | { type: "ModelDownloadFailed" }
  | { type: "ModelDownloadStarted" }
  | { type: "UpdateReady"; version: string };

export type RequiredStates = {
  readonly offline: boolean;
  readonly rateLimit: { readonly provider: string; readonly resumeAt: number } | null;
  readonly needsReauth: readonly { readonly accountId: string; readonly provider: string }[];
  readonly signInCancelled: boolean;
  readonly modelDownloadFailed: boolean;
  readonly updateVersion: string | null;
};

export const noRequiredStates: RequiredStates = {
  offline: false,
  rateLimit: null,
  needsReauth: [],
  signInCancelled: false,
  modelDownloadFailed: false,
  updateVersion: null,
};

export function reduceRequiredStates(
  state: RequiredStates,
  event: RequiredStateEvent,
): RequiredStates {
  switch (event.type) {
    case "Offline":
      return { ...state, offline: true };
    case "Online":
      return { ...state, offline: false };
    case "RateLimited":
      return { ...state, rateLimit: { provider: event.provider, resumeAt: event.resumeAt } };
    // The event stream is flowing again: the rate-limit notice clears itself.
    case "SyncResumed":
      return { ...state, rateLimit: null };
    case "NeedsReauth":
      return {
        ...state,
        needsReauth: [
          ...state.needsReauth.filter((account) => account.accountId !== event.accountId),
          { accountId: event.accountId, provider: event.provider },
        ],
      };
    case "Reconnected":
      return {
        ...state,
        needsReauth: state.needsReauth.filter((account) => account.accountId !== event.accountId),
      };
    case "SignInCancelled":
      return { ...state, signInCancelled: true };
    case "SignInStarted":
      return { ...state, signInCancelled: false };
    case "ModelDownloadFailed":
      return { ...state, modelDownloadFailed: true };
    case "ModelDownloadStarted":
      return { ...state, modelDownloadFailed: false };
    case "UpdateReady":
      return { ...state, updateVersion: event.version };
  }
}

/** Whole minutes to show for an auto-resume estimate; never below 1 so it never reads "0 minutes". */
export function minutesUntil(resumeAt: number, now: number): number {
  return Math.max(1, Math.ceil((resumeAt - now) / 60_000));
}
