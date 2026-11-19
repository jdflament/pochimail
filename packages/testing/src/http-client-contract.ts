import { AccountId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { createLogger, type Logger } from "@pochimail/logger/logger";
import {
  BlockedSocketError,
  egressPolicy,
  type HostAllowlist,
} from "@pochimail/net/egress/allowlist";
import {
  BlockedHostError,
  type Fetch,
  type FetchResponse,
  type HttpClient,
  RequestCancelledError,
  RequestFailedError,
  RequestTimeoutError,
} from "@pochimail/net/egress/http-client";
import { expect } from "vitest";

export interface HttpClientHarness {
  readonly client: HttpClient;
  readonly allowlist: HostAllowlist;
  /** URLs handed to the transport: empty when the allow-list blocked the call. */
  attempts(): readonly string[];
  logged(): readonly string[];
}

export interface HttpClientHarnessOptions {
  readonly transport: Fetch;
  readonly allowlist: HostAllowlist;
  readonly logger: Logger;
}

/** Future adapters pass their own client through this factory and run the same checks unchanged. */
export type HttpClientHarnessFactory = (options: HttpClientHarnessOptions) => HttpClient;

const fakeTransport = (attempts: string[]): Fetch => {
  return async (url, init) => {
    attempts.push(url);
    if (url.endsWith("/hang"))
      return new Promise<FetchResponse>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    // A hostile or broken transport that ignores the signal and never settles.
    if (url.endsWith("/ignore")) return new Promise<FetchResponse>(() => {});
    if (url.endsWith("/redirect")) return { status: 302, ok: false, text: async () => "" };
    if (url.endsWith("/throttled"))
      return {
        status: 429,
        ok: false,
        headers: { get: (name) => (name === "retry-after" ? "30" : null) },
        text: async () => "",
      };
    return { status: 200, ok: true, text: async () => "ok" };
  };
};

export const httpClientChecks: readonly Check<HttpClientHarness>[] = [
  check("blocks an unlisted host with a typed error before any network call", async (h) => {
    const result = await h.client.request({ url: "https://evil.example/v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(BlockedHostError);
    expect(h.attempts()).toEqual([]);
  }),

  check("never suffix-matches a lookalike of a documented host", async (h) => {
    const result = await h.client.request({
      url: "https://evil-gmail.googleapis.com.example/v1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(BlockedHostError);
    expect(h.attempts()).toEqual([]);
  }),

  check(
    "refuses plaintext HTTP to a documented host so traffic cannot be downgraded",
    async (h) => {
      const result = await h.client.request({ url: "http://gmail.googleapis.com/v1" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(RequestFailedError);
      expect(h.attempts()).toEqual([]);
    },
  ),

  check("lets each documented H1–H5 API host through", async (h) => {
    const hosts = [
      "gmail.googleapis.com",
      "oauth2.googleapis.com",
      "graph.microsoft.com",
      "login.microsoftonline.com",
    ];
    for (const host of hosts) {
      const result = await h.client.request({ url: `https://${host}/v1` });
      expect(result.ok, host).toBe(true);
    }
    expect(h.attempts()).toHaveLength(hosts.length);
  }),

  check("matches a mixed-case, trailing-dot spelling of an allowed host", async (h) => {
    expect((await h.client.request({ url: "https://GMAIL.googleapis.com./v1" })).ok).toBe(true);
  }),

  check("adds a connected account's IMAP socket and revokes it on removal", async (h) => {
    const accountId = unwrap(AccountId("acc-imap-1"));
    const endpoint = { host: "IMAP.example.com", port: 993 };
    const guarded = () => h.allowlist.assertSocketAllowed(endpoint.host, endpoint.port);
    expect(guarded).toThrow(BlockedSocketError);
    expect(h.allowlist.allowsSocket(endpoint.host, endpoint.port)).toBe(false);

    h.allowlist.addAccount({ accountId, imap: endpoint });
    expect(guarded).not.toThrow();
    expect(h.allowlist.allowsSocket(endpoint.host, endpoint.port)).toBe(true);

    h.allowlist.removeAccount(accountId);
    expect(guarded).toThrow(BlockedSocketError);
    expect(h.attempts()).toEqual([]); // sockets never travel through the HTTP client
  }),

  check("does not allow an account socket on a port that was never registered", async (h) => {
    h.allowlist.addAccount({
      accountId: unwrap(AccountId("acc-imap-2")),
      imap: { host: "imap.example.com", port: 993 },
      smtp: { host: "smtp.example.com", port: 587 },
    });
    expect(() => h.allowlist.assertSocketAllowed("smtp.example.com", 587)).not.toThrow();
    expect(() => h.allowlist.assertSocketAllowed("imap.example.com", 143)).toThrow(
      BlockedSocketError,
    );
    expect(h.attempts()).toEqual([]);
  }),

  check("cancels an in-flight request and refuses an already-aborted one", async (h) => {
    const controller = new AbortController();
    const pending = h.client.request({
      url: "https://gmail.googleapis.com/hang",
      signal: controller.signal,
    });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestCancelledError);

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const immediate = await h.client.request({
      url: "https://gmail.googleapis.com/v1",
      signal: alreadyAborted.signal,
    });
    expect(immediate.ok).toBe(false);
    if (!immediate.ok) expect(immediate.error).toBeInstanceOf(RequestCancelledError);
    expect(h.attempts()).toEqual(["https://gmail.googleapis.com/hang"]);
  }),

  check("times out with a typed error when the deadline passes", async (h) => {
    const result = await h.client.request({
      url: "https://gmail.googleapis.com/hang",
      timeoutMs: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestTimeoutError);
  }),

  check(
    "wins the timeout even when the transport ignores AbortSignal and never settles",
    async (h) => {
      const result = await h.client.request({
        url: "https://gmail.googleapis.com/ignore",
        timeoutMs: 5,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(RequestTimeoutError);
    },
  ),

  check(
    "surfaces a Retry-After header on the response and leaves it absent otherwise",
    async (h) => {
      const throttled = await h.client.request({ url: "https://gmail.googleapis.com/throttled" });
      if (!throttled.ok) throw new Error("expected a response");
      expect(throttled.value.retryAfter).toBe("30");
      const plain = await h.client.request({ url: "https://gmail.googleapis.com/v1" });
      if (!plain.ok) throw new Error("expected a response");
      expect(plain.value.retryAfter).toBeUndefined();
    },
  ),

  check("refuses a redirect response instead of leaving the allow-list", async (h) => {
    const result = await h.client.request({ url: "https://gmail.googleapis.com/redirect" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestFailedError);
    expect(h.attempts()).toEqual(["https://gmail.googleapis.com/redirect"]);
  }),

  check("logs only the canonical blocked host, never the requested path or query", async (h) => {
    const result = await h.client.request({ url: "https://EVIL.example./private?secretvalue=abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(BlockedHostError);
      expect((result.error as BlockedHostError).host).toBe("evil.example");
    }
    const lines = h.logged().join(" ");
    expect(lines).toContain("evil.example");
    expect(lines).not.toContain("/private");
    expect(lines).not.toContain("secretvalue");
  }),
];

/** Registers every check as a vitest test with a fresh harness, shared by all client adapters. */
export const registerHttpClientContract = (makeClient: HttpClientHarnessFactory): void => {
  registerContract("HttpClient contract", httpClientChecks, () => {
    const attempts: string[] = [];
    const logged: string[] = [];
    const allowlist = egressPolicy.create();
    const logger = createLogger({
      sink: { write: (record) => logged.push(`${record.level}:${record.message}`) },
    });
    return {
      client: makeClient({ transport: fakeTransport(attempts), allowlist, logger }),
      allowlist,
      attempts: () => attempts,
      logged: () => logged,
    };
  });
};
