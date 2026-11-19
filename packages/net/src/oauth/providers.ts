import type { ProviderKind } from "@pochimail/core/domain/account";
import { MissingClientConfig } from "@pochimail/core/errors";
import type { AutonomyLevel } from "@pochimail/core/policies/autonomy";
import { err, ok, type Result } from "@pochimail/kernel/result";

/**
 * The two OAuth providers of v1 (ADR 0007). Yahoo, iCloud and other IMAP accounts use app
 * passwords and never reach this module; send scopes stay out until M5/P2.
 */
export const OAUTH_PROVIDER_IDS = ["google", "microsoft"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

/** How much the account may do: "Just look" reads, Suggest/Autopilot change mail. */
export type ScopeTier = "read" | "modify";

export interface OAuthProviderConfig {
  readonly id: OAuthProviderId;
  /** What the account row calls this provider (`gmail` / `graph`). */
  readonly accountProvider: ProviderKind;
  /** Build-time config key; official builds inject the id, forks register their own (ADR 0007). */
  readonly clientIdEnv: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  /** `null`: the provider documents no user-token revocation endpoint; removal deletes locally only. */
  readonly revokeUrl: string | null;
  /** Fixed authorization-request parameters (offline access, consent prompt, response mode). */
  readonly authorizationParams: Readonly<Record<string, string>>;
  readonly scopes: Readonly<Record<ScopeTier, readonly string[]>>;
}

/**
 * Endpoints come from ADR 0007 and docs/security/network.md (H2, H3, H5). `accounts.google.com` is
 * loaded by the system browser, never by the app; only the token and revocation hosts are called here.
 */
export const OAUTH_PROVIDER_CONFIGS: Readonly<Record<OAuthProviderId, OAuthProviderConfig>> = {
  google: {
    id: "google",
    accountProvider: "gmail",
    clientIdEnv: "POCHIMAIL_GOOGLE_CLIENT_ID",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    // Google sends a refresh token only with offline access, and only re-sends it on a consent prompt.
    authorizationParams: { access_type: "offline", prompt: "consent" },
    scopes: {
      read: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
      modify: ["openid", "email", "https://www.googleapis.com/auth/gmail.modify"],
    },
  },
  microsoft: {
    id: "microsoft",
    accountProvider: "graph",
    clientIdEnv: "POCHIMAIL_MICROSOFT_CLIENT_ID",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    // Microsoft identity platform v2.0 has no public per-app token revocation endpoint (network.md H5).
    revokeUrl: null,
    authorizationParams: { response_mode: "query" },
    scopes: {
      read: ["openid", "offline_access", "User.Read", "Mail.Read"],
      modify: ["openid", "offline_access", "User.Read", "Mail.ReadWrite"],
    },
  },
};

export const oauthProviderConfig = (id: OAuthProviderId): OAuthProviderConfig =>
  OAUTH_PROVIDER_CONFIGS[id];

/** Just look reads; Suggest and Autopilot need the modify tier (ADR 0007 scope table). */
export const scopeTierFor = (autonomy: AutonomyLevel): ScopeTier =>
  autonomy === "just-look" ? "read" : "modify";

export const scopesFor = (
  config: OAuthProviderConfig,
  autonomy: AutonomyLevel,
): readonly string[] => config.scopes[scopeTierFor(autonomy)];

/** The client id from build-time config, or a typed error the UI can explain (never a hard-coded id). */
export const clientIdFrom = (
  config: OAuthProviderConfig,
  env: Readonly<Record<string, string | undefined>>,
): Result<string, MissingClientConfig> => {
  const clientId = env[config.clientIdEnv]?.trim() ?? "";
  return clientId.length === 0 ? err(new MissingClientConfig(config.id)) : ok(clientId);
};

/**
 * Whether raising autonomy needs a new consent: the account was granted less than the tier asks.
 * ADR 0007: switching autonomy up re-prompts for the extra scope instead of failing later.
 */
export const scopeUpgradeNeeded = (
  config: OAuthProviderConfig,
  grantedScopes: readonly string[],
  autonomy: AutonomyLevel,
): boolean => scopesFor(config, autonomy).some((scope) => !grantedScopes.includes(scope));
