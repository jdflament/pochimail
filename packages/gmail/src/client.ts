import type { OAuthTokenSource } from "@pochimail/accounts/ports/oauth";
import type { MailProviderError } from "@pochimail/core/ports/mail-provider";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import {
  AuthExpired,
  Cancelled,
  Offline,
  ProviderFailed,
  RateLimited,
} from "@pochimail/kernel/errors";
import type { AccountId } from "@pochimail/kernel/ids";
import { err, ok, type Result } from "@pochimail/kernel/result";
import type { HttpClientError, HttpResponse } from "@pochimail/net/egress/http-client";
import type { RateLimitedClient } from "@pochimail/net/egress/rate-limit";
import { GMAIL_BASE } from "./api.ts";

export interface GmailClientDeps {
  readonly http: RateLimitedClient;
  readonly tokens: OAuthTokenSource;
  readonly account: { readonly id: AccountId };
}

export interface GmailCall {
  readonly method?: "GET" | "POST";
  /** Path under `users/me`, e.g. `messages`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | readonly string[]>>;
  readonly body?: unknown;
  /** Quota units this call costs (spent from the account's bucket). */
  readonly cost: number;
  readonly signal: CancelSignal;
}

/** `json` is `null` for an empty body (204) and for a 404, which callers decide about. */
export interface GmailReply {
  readonly status: number;
  readonly json: unknown;
}

function urlOf(call: GmailCall): string {
  const url = new URL(`${GMAIL_BASE}/${call.path}`);
  for (const [key, value] of Object.entries(call.query ?? {})) {
    for (const v of typeof value === "object" ? value : [String(value)]) {
      url.searchParams.append(key, v);
    }
  }
  return url.toString();
}

function transportError(error: HttpClientError | RateLimited): MailProviderError {
  if (error instanceof RateLimited) return error;
  if (error.kind === "cancelled") return new Cancelled();
  if (error.kind === "blocked") return new ProviderFailed("Gmail host is not allowed");
  return new Offline();
}

/**
 * Every Gmail call: bearer token from the account's token source, quota spent through net's
 * rate-limited client, and Gmail's answers mapped to the provider errors the use cases branch on.
 * A 401 refreshes the token once; a second 401 is `AuthExpired`.
 */
export class GmailClient {
  constructor(private readonly deps: GmailClientDeps) {}

  async call(call: GmailCall): AsyncResult<GmailReply, MailProviderError> {
    if (call.signal.aborted) return err(new Cancelled());
    const first = await this.once(call, false);
    if (!first.ok || first.value.status !== 401) return first;
    const second = await this.once(call, true);
    if (second.ok && second.value.status === 401) return err(new AuthExpired());
    return second;
  }

  private async accessToken(
    call: GmailCall,
    refresh: boolean,
  ): AsyncResult<string, MailProviderError> {
    const { tokens } = this.deps;
    const token = refresh ? await tokens.refresh(call.signal) : await tokens.token(call.signal);
    if (token.ok) return ok(token.value.token);
    const error = token.error;
    if (error instanceof AuthExpired || error instanceof Offline) return err(error);
    return err(new ProviderFailed("Could not get an access token"));
  }

  private async once(
    call: GmailCall,
    refresh: boolean,
  ): AsyncResult<GmailReply, MailProviderError> {
    const token = await this.accessToken(call, refresh);
    if (!token.ok) return token;
    const response = await this.deps.http.request({
      url: urlOf(call),
      method: call.method ?? "GET",
      headers: {
        authorization: `Bearer ${token.value}`,
        ...(call.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      signal: call.signal as AbortSignal,
      cost: call.cost,
      account: { id: this.deps.account.id, provider: "gmail" },
    });
    if (!response.ok) return err(transportError(response.error));
    return answer(response.value);
  }
}

/** Gmail's HTTP answer to the reply or provider error the callers branch on. */
function answer({ status, body }: HttpResponse): Result<GmailReply, MailProviderError> {
  if (status === 401 || status === 404) return ok({ status, json: null });
  if (status < 200 || status >= 300) return err(new ProviderFailed(`Gmail answered ${status}`));
  return ok({ status, json: body === "" ? null : (JSON.parse(body) as unknown) });
}
