import type { ProviderKind } from "@pochimail/accounts/model/account";
import type { TokenRevoker } from "@pochimail/accounts/ports/oauth";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { Cancelled, Offline, ProviderFailed } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { type FetchLike, postForm } from "./http.ts";
import { OAUTH_PROVIDER_CONFIGS, type OAuthProviderConfig } from "./providers.ts";

const OAUTH_PROVIDER_OF: Readonly<Record<ProviderKind, "google" | "microsoft" | null>> = {
  gmail: "google",
  graph: "microsoft",
};

export interface OAuthRevokerOptions {
  readonly fetch: FetchLike;
  /** Test seam: provider configs whose revocation endpoint is a local fake. */
  readonly configs?: Partial<Readonly<Record<"google" | "microsoft", OAuthProviderConfig>>>;
}

/**
 * Revokes an account's credential at the provider when the account is removed (ADR 0007).
 * Google has a revocation endpoint (network.md H3). Microsoft identity platform v2.0 documents
 * no per-app user-token revocation endpoint, so removal is local for Microsoft (network.md H5).
 */
export const createOAuthRevoker = (options: OAuthRevokerOptions): TokenRevoker => ({
  revoke: async (
    provider: ProviderKind,
    token: string,
    signal: CancelSignal,
  ): AsyncResult<void, Offline | ProviderFailed | Cancelled> => {
    const id = OAUTH_PROVIDER_OF[provider];
    if (id === null) return ok(undefined);
    const config = options.configs?.[id] ?? OAUTH_PROVIDER_CONFIGS[id];
    if (config.revokeUrl === null) return ok(undefined);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await postForm(options.fetch, config.revokeUrl, { token }, signal);
    } catch {
      return err(signal.aborted ? new Cancelled() : new Offline());
    }
    // 400/401/404: the token was already invalid or unknown, which is the same end state.
    if (response.ok || [400, 401, 404].includes(response.status)) return ok(undefined);
    return response.status >= 500 ? err(new Offline()) : err(new ProviderFailed("Revoke failed"));
  },
});
