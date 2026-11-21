import type {
  AccessToken,
  OAuthTokenError,
  OAuthTokenSource,
} from "@pochimail/accounts/ports/oauth";
import type { SecretStore } from "@pochimail/accounts/ports/secret-store";
import type { CancelSignal } from "@pochimail/kernel/common";
import { AuthExpired, Cancelled, Offline, ProviderFailed } from "@pochimail/kernel/errors";
import { err, ok, type Result } from "@pochimail/kernel/result";
import { type FetchLike, postForm } from "./http.ts";
import { clientCredentialsFrom, type OAuthProviderConfig } from "./providers.ts";
import { expiresAtFrom, parseTokenResponse, scopeList } from "./token-response.ts";

/** Refresh this long before the provider's expiry, so a request in flight never carries a dead token. */
export const TOKEN_EXPIRY_SKEW_MS = 60_000;

export interface AccessTokenSourceOptions {
  readonly config: OAuthProviderConfig;
  readonly clientId: string;
  /** Build-time config; the client secret is read from it for the refresh call only. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Where the account's refresh token lives; written by sign-in through `ConnectAccount`. */
  readonly secretKey: string;
  readonly secrets: SecretStore;
  readonly fetch: FetchLike;
  readonly now?: () => Date;
  /** Scopes the sign-in granted, until the provider says something newer. */
  readonly grantedScopes?: readonly string[];
}

/**
 * One account's access tokens: kept in memory, refreshed from the keychain-backed refresh token
 * when they near expiry (ADR 0007). Nothing is written to disk here except a rotated refresh token,
 * back to the secret store, and no token ever appears in an error message.
 */
export const createAccessTokenSource = (options: AccessTokenSourceOptions): OAuthTokenSource => {
  const { config, clientId, secretKey, secrets, fetch: fetchLike } = options;
  const now = options.now ?? (() => new Date());
  let cached: AccessToken | null = null;
  let scopes: readonly string[] = options.grantedScopes ?? [];

  const usable = (token: AccessToken): boolean =>
    Date.parse(token.expiresAt) - TOKEN_EXPIRY_SKEW_MS > now().getTime();

  /** Shared by every caller: at most one refresh request is in flight per account. */
  let inFlight: Promise<Result<AccessToken, OAuthTokenError>> | null = null;

  const refreshOnce = async (
    signal: CancelSignal,
  ): Promise<Result<AccessToken, OAuthTokenError>> => {
    if (signal.aborted) return err(new Cancelled());
    const stored = await secrets.get(secretKey);
    if (!stored.ok) return stored;
    if (stored.value === null) {
      // No refresh token: the account cannot act until the user signs in again.
      return err(new AuthExpired());
    }

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await postForm(
        fetchLike,
        config.tokenUrl,
        {
          grant_type: "refresh_token",
          refresh_token: stored.value,
          ...clientCredentialsFrom(config, clientId, options.env ?? {}),
        },
        signal,
      );
    } catch {
      return err(signal.aborted ? new Cancelled() : new Offline());
    }

    const tokens = parseTokenResponse(response.body);
    if (!response.ok || tokens === null || tokens.access_token === undefined) {
      // 4xx means the credential itself is dead (invalid_grant, revoked, wrong client): re-auth.
      // 5xx, throttling and unreadable bodies are transient: retry later, never a re-auth prompt.
      if (
        !response.ok &&
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        return err(new AuthExpired());
      }
      return response.ok
        ? err(new ProviderFailed("Token refresh answered something else"))
        : err(new Offline());
    }

    scopes = scopeList(tokens, scopes);
    cached = {
      token: tokens.access_token,
      expiresAt: expiresAtFrom(tokens, now()),
      scopes,
    };
    // A provider may rotate the refresh token (Microsoft does): persist the newest one or the
    // account dies on restart. The access token stays cached even if the write fails, so the
    // caller can keep working and the next refresh retries the write.
    if (tokens.refresh_token !== undefined && tokens.refresh_token !== stored.value) {
      const rotated = await secrets.set(secretKey, tokens.refresh_token);
      if (!rotated.ok) return rotated;
    }
    return ok(cached);
  };

  /**
   * Single-flight: concurrent `token()`/`refresh()` calls share one request. With a rotating
   * provider, posting the same refresh token twice would make the loser `invalid_grant` and
   * wrongly mark the account `needs_reauth`.
   */
  const refresh = (signal: CancelSignal): Promise<Result<AccessToken, OAuthTokenError>> => {
    if (inFlight !== null) return inFlight;
    const run = refreshOnce(signal);
    inFlight = run;
    const settle = (): void => {
      if (inFlight === run) inFlight = null;
    };
    void run.then(settle, settle);
    return run;
  };

  return {
    token: (signal) =>
      Promise.resolve(cached !== null && usable(cached) ? ok(cached) : refresh(signal)),
    refresh,
  };
};
