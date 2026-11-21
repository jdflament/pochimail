import {
  type InvalidCallback,
  type MissingClientConfig,
  SignInCancelled,
} from "@pochimail/accounts/errors";
import type { ProviderKind } from "@pochimail/accounts/model/account";
import type { AutonomyLevel } from "@pochimail/core/policies/autonomy";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { ProviderFailed } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { type FetchLike, postForm } from "./http.ts";
import { openLoopbackReceiver, SIGN_IN_TIMEOUT_MS } from "./loopback.ts";
import { createPkce, randomToken } from "./pkce.ts";
import {
  clientCredentialsFrom,
  clientIdFrom,
  type OAuthProviderConfig,
  type OAuthProviderId,
  oauthProviderConfig,
  scopesFor,
} from "./providers.ts";
import {
  addressFromIdToken,
  expiresAtFrom,
  parseTokenResponse,
  scopeList,
} from "./token-response.ts";

export interface OAuthSignInOptions {
  /** Build-time configuration; the client id is never hard-coded (ADR 0007). */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Opens the consent page in the user's system browser (main process in the app). */
  readonly openBrowser: (url: string) => Promise<void>;
  readonly fetch: FetchLike;
  readonly now?: () => Date;
  /** Test seam; defaults to five minutes (ADR 0007). */
  readonly timeoutMs?: number;
}

export interface SignInRequest {
  readonly provider: OAuthProviderId;
  readonly autonomy: AutonomyLevel;
  /** Test seam: a provider config whose endpoints point at a local fake authorization server. */
  readonly config?: OAuthProviderConfig;
}

/** What a completed sign-in hands back. The caller puts `refreshToken` in `SecretStore` only. */
export interface SignInGrant {
  readonly provider: OAuthProviderId;
  readonly accountProvider: ProviderKind;
  readonly refreshToken: string;
  /** The address the user signed in as, when the provider's id token names one. */
  readonly address: string | undefined;
  /** In memory only; never persisted, never logged. */
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly scopes: readonly string[];
}

export type SignInError = MissingClientConfig | SignInCancelled | InvalidCallback | ProviderFailed;

/**
 * Authorization-code + PKCE sign-in in the system browser, redirecting to a loopback listener
 * (ADR 0007). The verifier and `state` stay in this process; the listener answers one callback and
 * closes. Cancelling or the five-minute timeout returns `SignInCancelled` and frees the port.
 */
export class OAuthSignIn {
  constructor(private readonly options: OAuthSignInOptions) {}

  async execute(
    request: SignInRequest,
    signal: CancelSignal,
  ): AsyncResult<SignInGrant, SignInError> {
    const { env, fetch: fetchLike, now = () => new Date() } = this.options;
    const config = request.config ?? oauthProviderConfig(request.provider);
    const clientId = clientIdFrom(config, env);
    if (!clientId.ok) return clientId;

    const pkce = createPkce();
    const state = randomToken(32);
    const scopes = scopesFor(config, request.autonomy);
    const receiver = await openLoopbackReceiver();
    if (!receiver.ok) return receiver;

    try {
      const authorizeUrl = buildAuthorizeUrl(config, {
        clientId: clientId.value,
        redirectUri: receiver.value.redirectUri,
        state,
        challenge: pkce.challenge,
        scopes,
      });
      try {
        await this.options.openBrowser(authorizeUrl);
      } catch {
        return err(new ProviderFailed("Could not open the system browser"));
      }

      const callback = await receiver.value.waitForCode({
        state,
        signal,
        timeoutMs: this.options.timeoutMs ?? SIGN_IN_TIMEOUT_MS,
      });
      if (!callback.ok) return callback;

      return await exchangeCode({
        config,
        clientCredentials: clientCredentialsFrom(config, clientId.value, env),
        redirectUri: receiver.value.redirectUri,
        code: callback.value,
        verifier: pkce.verifier,
        scopes,
        fetch: fetchLike,
        now,
        signal,
      });
    } finally {
      await receiver.value.close();
    }
  }
}

interface AuthorizeUrlInput {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly challenge: string;
  readonly scopes: readonly string[];
}

const buildAuthorizeUrl = (config: OAuthProviderConfig, input: AuthorizeUrlInput): string => {
  const url = new URL(config.authorizeUrl);
  const params: Record<string, string> = {
    ...config.authorizationParams,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: input.scopes.join(" "),
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  };
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  return url.toString();
};

interface ExchangeInput {
  readonly config: OAuthProviderConfig;
  /** `client_id`, and `client_secret` where the provider needs it; never logged. */
  readonly clientCredentials: Readonly<Record<string, string>>;
  readonly redirectUri: string;
  readonly code: string;
  readonly verifier: string;
  readonly scopes: readonly string[];
  readonly fetch: FetchLike;
  readonly now: () => Date;
  readonly signal: CancelSignal;
}

/** Trades the authorization code (and the verifier) for tokens. Provider bodies are validated. */
const exchangeCode = async (input: ExchangeInput): AsyncResult<SignInGrant, SignInError> => {
  const { config, signal } = input;
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await postForm(
      input.fetch,
      config.tokenUrl,
      {
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        ...input.clientCredentials,
        code_verifier: input.verifier,
      },
      signal,
    );
  } catch {
    return err(signal.aborted ? new SignInCancelled() : new ProviderFailed());
  }
  const tokens = parseTokenResponse(response.body);
  if (!response.ok || tokens === null || tokens.access_token === undefined) {
    return err(new ProviderFailed("Token exchange failed"));
  }
  if (tokens.refresh_token === undefined) {
    // Without a refresh token the account would silently need re-consent on every restart.
    return err(new ProviderFailed("Provider returned no refresh token"));
  }
  return ok({
    provider: config.id,
    accountProvider: config.accountProvider,
    refreshToken: tokens.refresh_token,
    address: addressFromIdToken(tokens),
    accessToken: tokens.access_token,
    expiresAt: expiresAtFrom(tokens, input.now()),
    scopes: scopeList(tokens, input.scopes),
  });
};
