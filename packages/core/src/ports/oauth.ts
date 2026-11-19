import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { ProviderKind } from "../domain/account.ts";
import type { AuthExpired, Offline, ProviderError } from "../errors.ts";

/**
 * A short-lived bearer token. Lives in memory only: it is never written to a row, the secret
 * store or a log (ADR 0007).
 */
export interface AccessToken {
  readonly token: string;
  readonly expiresAt: string;
  /** What the provider says was granted; used to know when autonomy needs a new consent. */
  readonly scopes: readonly string[];
}

/** `AuthExpired` is the only failure that means "ask the user to sign in again". */
export type OAuthTokenError = AuthExpired | Offline | ProviderError | StorageError;

/**
 * The access-token side of an OAuth account (ADR 0007). Adapters cache the token in memory and
 * swap the refresh token at the provider's token endpoint when it expires.
 */
export interface OAuthTokenSource {
  /** Cached token, refreshed automatically when it is at or near expiry. */
  token(signal: CancelSignal): AsyncResult<AccessToken, OAuthTokenError>;
  /** Forgets the cache and refreshes now; call after the provider answered 401. */
  refresh(signal: CancelSignal): AsyncResult<AccessToken, OAuthTokenError>;
}

/** Revokes an account's credential at the provider when the account is removed (ADR 0007). */
export interface TokenRevoker {
  /**
   * `ok` when there is nothing to revoke at the provider (IMAP app passwords, or a provider with
   * no user-token revocation endpoint). A provider failure is returned, but removal still proceeds
   * locally: a lost network must never keep a credential on the device.
   */
  revoke(
    provider: ProviderKind,
    token: string,
    signal: CancelSignal,
  ): AsyncResult<void, ProviderError | StorageError | Cancelled>;
}
