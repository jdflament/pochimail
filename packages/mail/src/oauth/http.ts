import type { CancelSignal } from "@pochimail/core/ports/common";
import { egressPolicy } from "../egress/allowlist.ts";
import { createHttpClient, type HttpClient, type HttpClientError } from "../egress/http-client.ts";

/** The smallest shape of `fetch` the OAuth code needs, so tests answer in memory or from a local fake. */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

export type FetchLike = (
  url: string,
  init: {
    readonly method: "POST" | "GET";
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal?: CancelSignal;
  },
) => Promise<HttpResponse>;

/** A token or revoke call that hangs must not outlive the five-minute sign-in window. */
export const DEFAULT_OAUTH_REQUEST_TIMEOUT_MS = 30_000;
/** Token and revocation bodies are tiny; anything larger is hostile or broken. */
export const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;

export interface OAuthFetchOptions {
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

/** Safe to show or log: the host, URL and headers never reach this message. */
const oauthRequestError = (error: HttpClientError): Error => {
  switch (error.kind) {
    case "blocked":
      return new Error("OAuth request to a host outside the egress allow-list");
    case "timeout":
      return new Error("OAuth request timed out");
    case "cancelled":
      return new Error("Request cancelled");
    case "request-failed":
      return new Error(`OAuth request failed: ${error.message}`);
  }
};

/**
 * Adapts the M2-06 `HttpClient` (one shared egress allow-list, `redirect: "error"`, hard timeout) to
 * `FetchLike`. The host check and timeout live there; this adds the response size cap that the
 * client leaves out, because a token body is small and an oversized one is hostile.
 */
export const createOAuthFetch = (http: HttpClient, options: OAuthFetchOptions = {}): FetchLike => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_OAUTH_REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  return async (url, init) => {
    // `CancelSignal` is deliberately not a DOM `AbortSignal` (core has no DOM types), so bridge it.
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    if (init.signal?.aborted === true) controller.abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await http.request({
        url,
        method: init.method,
        timeoutMs,
        signal: controller.signal,
        ...(init.headers === undefined ? {} : { headers: init.headers }),
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      if (!result.ok) throw oauthRequestError(result.error);
      const { status, ok, body } = result.value;
      if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
        throw new Error("OAuth response exceeded the size cap");
      }
      return { ok, status, body };
    } finally {
      init.signal?.removeEventListener("abort", abort);
    }
  };
};

/** The app's OAuth network adapter: the shared egress client, tuned for sign-in calls. */
export const platformFetch: FetchLike = createOAuthFetch(
  createHttpClient({
    allowlist: egressPolicy.create(),
    defaultTimeoutMs: DEFAULT_OAUTH_REQUEST_TIMEOUT_MS,
  }),
);

/** Encodes one form body; OAuth token and revocation endpoints take `application/x-www-form-urlencoded`. */
export const formBody = (fields: Readonly<Record<string, string>>): string =>
  new URLSearchParams(fields).toString();

export const postForm = (
  fetchLike: FetchLike,
  url: string,
  fields: Readonly<Record<string, string>>,
  signal?: CancelSignal,
): Promise<HttpResponse> =>
  fetchLike(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: formBody(fields),
    ...(signal === undefined ? {} : { signal }),
  });

/** A JSON object, or `null` when the provider answered something else. Never throws on HTML error pages. */
export const parseJsonObject = (body: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
