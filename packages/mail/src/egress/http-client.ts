import type { Logger } from "@pochimail/core/logger";
import { err, ok, type Result } from "@pochimail/core/result";
import { canonicalHost, type HostAllowlist } from "./allowlist.ts";

export interface HttpRequest {
  readonly url: string;
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: string;
}

/** Expected failures are `Result` values; each class is a stable, catchable kind. */
export abstract class HttpClientError extends Error {
  abstract readonly kind: "blocked" | "timeout" | "cancelled" | "request-failed";
}

export class BlockedHostError extends HttpClientError {
  override readonly kind = "blocked" as const;
  readonly host: string;

  constructor(host: string) {
    super("Outbound request to a host outside the allow-list was blocked");
    this.name = "BlockedHostError";
    this.host = host;
  }
}

export class RequestTimeoutError extends HttpClientError {
  override readonly kind = "timeout" as const;

  constructor() {
    super("Outbound request timed out");
    this.name = "RequestTimeoutError";
  }
}

export class RequestCancelledError extends HttpClientError {
  override readonly kind = "cancelled" as const;

  constructor() {
    super("Outbound request was cancelled");
    this.name = "RequestCancelledError";
  }
}

export class RequestFailedError extends HttpClientError {
  override readonly kind = "request-failed" as const;

  constructor(message = "Outbound request failed", cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RequestFailedError";
  }
}

/** Injected transport. The real `fetch` satisfies it; tests record calls without opening sockets. */
export interface FetchInit {
  readonly signal: AbortSignal;
  readonly redirect: "error";
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  text(): Promise<string>;
}

export type Fetch = (url: string, init: FetchInit) => Promise<FetchResponse>;

export interface HttpClient {
  request(request: HttpRequest): Promise<Result<HttpResponse, HttpClientError>>;
}

/**
 * The single worker-side HTTP client. Checks the shared allow-list before the transport is called,
 * never follows a redirect off an allowed host, and carries cancellation and a hard timeout into
 * the transport. Neither URLs nor response content are logged.
 */
export const createHttpClient = (options: {
  readonly allowlist: HostAllowlist;
  readonly fetch?: Fetch;
  readonly logger?: Logger;
  readonly defaultTimeoutMs?: number;
}): HttpClient => {
  const transport = options.fetch ?? globalThis.fetch;
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;

  return {
    async request(request) {
      let url: URL;
      try {
        url = new URL(request.url);
      } catch {
        return err(new RequestFailedError("Malformed request URL"));
      }

      const host = canonicalHost(url.hostname);
      if (!options.allowlist.allows(url)) {
        // Host only: never a URL, path, query, header or address (AGENTS.md §5).
        options.logger?.warn(`Outbound request blocked: ${host}`);
        return err(new BlockedHostError(host));
      }
      // The allow-list names TLS hosts; HTTP here would be a downgrade (threat model N2).
      if (url.protocol !== "https:") {
        options.logger?.warn(`Outbound request refused: ${host}`);
        return err(new RequestFailedError("Only HTTPS requests are allowed"));
      }
      if (request.signal?.aborted === true) return err(new RequestCancelledError());

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      request.signal?.addEventListener("abort", onAbort, { once: true });
      let timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // The deadline wins the race even when a transport ignores AbortSignal and never settles.
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          const reason = new RequestTimeoutError();
          controller.abort(reason);
          reject(reason);
        }, request.timeoutMs ?? defaultTimeoutMs);
      });

      try {
        const response = await Promise.race([
          (async () => {
            const result = await transport(url.href, {
              redirect: "error",
              signal: controller.signal,
              ...(request.method === undefined ? {} : { method: request.method }),
              ...(request.headers === undefined ? {} : { headers: request.headers }),
              ...(request.body === undefined ? {} : { body: request.body }),
            });
            // Defence in depth: even a transport that follows redirects cannot leave the allow-list.
            if (result.status >= 300 && result.status < 400)
              throw new RequestFailedError("Redirects are not followed");
            return { status: result.status, ok: result.ok, body: await result.text() };
          })(),
          deadline,
        ]);
        return ok(response);
      } catch (error) {
        if (timedOut || error instanceof RequestTimeoutError) return err(new RequestTimeoutError());
        if (controller.signal.aborted) return err(new RequestCancelledError());
        if (error instanceof RequestFailedError) return err(error);
        return err(new RequestFailedError("Outbound request failed", error));
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
      }
    },
  };
};
