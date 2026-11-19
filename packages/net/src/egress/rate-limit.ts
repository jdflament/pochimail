import type { ProviderKind } from "@pochimail/accounts/model/account";
import type { Clock } from "@pochimail/kernel/clock";
import { RateLimited } from "@pochimail/kernel/errors";
import type { AccountId } from "@pochimail/kernel/ids";
import { err, ok, type Result } from "@pochimail/kernel/result";
import { DEFAULT_RETRY_POLICY, type RetryPolicy, retryDelayMs } from "@pochimail/pipeline/retry";
import {
  type HttpClient,
  type HttpClientError,
  type HttpRequest,
  type HttpResponse,
  RequestCancelledError,
} from "./http-client.ts";

/** Gmail quota units per call (ADR 0004; quota page changed 2026-05-01). */
export const GMAIL_QUOTA_UNITS = {
  messagesGet: 20,
  messagesList: 5,
  historyList: 2,
  messagesBatchModify: 50,
} as const;

/** Graph: one unit per request; a `$batch` of n sub-requests counts n (max 20 per batch). */
export const GRAPH_BATCH_MAX = 20;

export interface BucketConfig {
  readonly capacity: number;
  readonly refillPerMinute: number;
}

/** Gmail: 6,000 units/min/user. Graph: ~10,000 requests/10 min/mailbox. IMAP: conservative. */
export const DEFAULT_BUCKETS: Readonly<Record<ProviderKind, BucketConfig>> = {
  gmail: { capacity: 6_000, refillPerMinute: 6_000 },
  graph: { capacity: 1_000, refillPerMinute: 1_000 },
  imap: { capacity: 120, refillPerMinute: 120 },
};

/** What the renderer shows for each provider kind (the states copy takes a display name). */
export const PROVIDER_DISPLAY_NAMES: Readonly<Record<ProviderKind, string>> = {
  gmail: "Google",
  graph: "Microsoft",
  imap: "IMAP",
};

/** Waits `ms` (real or fake time); resolves `false` if `signal` aborts first. */
export type Sleep = (ms: number, signal?: AbortSignal) => Promise<boolean>;

export const systemSleep: Sleep = (ms, signal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted === true) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** The worker events the renderer's required states consume (apps/desktop IPC contract). */
export type RateLimitEvent =
  | {
      readonly type: "RateLimited";
      /** Display name the required-state copy interpolates (e.g. "Google"). */
      readonly provider: string;
      readonly accountId: AccountId;
      readonly providerKind: ProviderKind;
      /** Epoch milliseconds, always finite. */
      readonly resumeAt: number;
    }
  | { readonly type: "SyncResumed" };

export interface RateLimitedRequest extends HttpRequest {
  readonly account: { readonly id: AccountId; readonly provider: ProviderKind };
  /** Quota units this call costs (default 1). */
  readonly cost?: number;
  /** Overrides the method-based guess; only idempotent requests are ever retried. */
  readonly idempotent?: boolean;
}

export interface RateLimitedClient {
  request(
    request: RateLimitedRequest,
  ): Promise<Result<HttpResponse, HttpClientError | RateLimited>>;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const THROTTLE_STATUSES = new Set([429, 503]);

/** No provider pause is honoured beyond this: a hostile or broken header cannot park an account. */
export const MAX_RETRY_AFTER_MS = 3_600_000;

const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * `Retry-After` is integer delta-seconds or an IMF-fixdate (RFC 9110 §10.2.3). Anything else is
 * undefined. The result is finite, capped at `MAX_RETRY_AFTER_MS`; a zero or past value means
 * "retry now" and is also undefined, so the caller falls back to backoff.
 */
const parseRetryAfterMs = (value: string | undefined, nowMs: number): number | undefined => {
  if (value === undefined) return undefined;
  const text = value.trim();
  let ms: number;
  if (/^\d+$/.test(text))
    ms = Number(text) * 1000; // 400 digits → Infinity → capped below
  else if (IMF_FIXDATE.test(text)) ms = Date.parse(text) - nowMs;
  else return undefined;
  if (Number.isNaN(ms) || ms <= 0) return undefined;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
};

interface AccountState {
  tokens: number;
  updatedAt: number;
  cooldownUntil: number;
  announced: boolean;
}

/**
 * Wraps the egress `HttpClient` with per-account throttling shared by every provider adapter.
 * Spends quota units from the account's own token bucket (waiting, not calling out, when empty),
 * and turns throttle responses into core's `RateLimited`. A `Retry-After` is honoured as-is:
 * the account cools down and the caller pauses until `resumeAt`. Without one, an idempotent
 * request is retried with the core's jittered exponential backoff; a non-idempotent one never is.
 */
export const createRateLimitedClient = (options: {
  readonly inner: HttpClient;
  readonly clock: Clock;
  readonly random: () => number;
  readonly sleep: Sleep;
  readonly onEvent?: (event: RateLimitEvent) => void;
  readonly buckets?: Partial<Record<ProviderKind, BucketConfig>>;
  readonly retry?: RetryPolicy;
  /** Longest single wait for the bucket to refill; beyond it the call is `RateLimited`. */
  readonly maxBucketWaitMs?: number;
}): RateLimitedClient => {
  const policy = options.retry ?? DEFAULT_RETRY_POLICY;
  const maxBucketWaitMs = options.maxBucketWaitMs ?? 60_000;
  const states = new Map<AccountId, AccountState>();
  const now = () => options.clock.now().getTime();

  const stateOf = (id: AccountId, bucket: BucketConfig): AccountState => {
    let state = states.get(id);
    if (state === undefined) {
      state = { tokens: bucket.capacity, updatedAt: now(), cooldownUntil: 0, announced: false };
      states.set(id, state);
    }
    return state;
  };

  const limited = (
    state: AccountState,
    account: RateLimitedRequest["account"],
    retryAfterMs: number,
  ) => {
    const resumeAt = now() + retryAfterMs;
    state.cooldownUntil = Math.max(state.cooldownUntil, resumeAt);
    state.announced = true;
    options.onEvent?.({
      type: "RateLimited",
      provider: PROVIDER_DISPLAY_NAMES[account.provider],
      accountId: account.id,
      providerKind: account.provider,
      resumeAt: state.cooldownUntil,
    });
    return err(new RateLimited({ retryAfterMs }));
  };

  return {
    async request(request) {
      const { account } = request;
      const bucket = {
        ...DEFAULT_BUCKETS[account.provider],
        ...options.buckets?.[account.provider],
      };
      const state = stateOf(account.id, bucket);
      const cost = Math.min(Math.max(request.cost ?? 1, 0), bucket.capacity);
      const idempotent = request.idempotent ?? IDEMPOTENT_METHODS.has(request.method ?? "GET");
      const { account: _account, cost: _cost, idempotent: _idempotent, ...httpRequest } = request;

      for (let attempt = 1; ; attempt++) {
        if (request.signal?.aborted === true) return err(new RequestCancelledError());

        // A throttled account makes no calls until its cooldown ends.
        if (state.cooldownUntil > now()) {
          return err(new RateLimited({ retryAfterMs: state.cooldownUntil - now() }));
        }

        // Reserve units (the balance may go negative), then wait out the deficit.
        const elapsed = now() - state.updatedAt;
        state.tokens = Math.min(
          bucket.capacity,
          state.tokens + (elapsed * bucket.refillPerMinute) / 60_000,
        );
        state.updatedAt = now();
        state.tokens -= cost;
        if (state.tokens < 0) {
          const waitMs = Math.ceil((-state.tokens * 60_000) / bucket.refillPerMinute);
          if (waitMs > maxBucketWaitMs) {
            state.tokens += cost;
            return limited(state, account, waitMs);
          }
          const finished = await options.sleep(waitMs, request.signal);
          if (!finished) {
            state.tokens += cost; // never spent: give the units back
            return err(new RequestCancelledError());
          }
        }

        const result = await options.inner.request(httpRequest);
        if (!result.ok) return result;
        const response = result.value;
        if (!THROTTLE_STATUSES.has(response.status)) {
          if (state.announced) {
            state.announced = false;
            options.onEvent?.({ type: "SyncResumed" });
          }
          return result;
        }

        const advised = parseRetryAfterMs(response.retryAfter, now());
        // The provider named a time, or retrying is unsafe or exhausted: pause, don't spin.
        if (advised !== undefined || !idempotent || attempt >= policy.maxAttempts) {
          return limited(state, account, advised ?? retryDelayMs(attempt, policy, options.random));
        }
        const delay = retryDelayMs(attempt, policy, options.random);
        if (!(await options.sleep(delay, request.signal))) return err(new RequestCancelledError());
      }
    },
  };
};

/** IMAP: at most `max` simultaneous connections per account. */
export const createConnectionLimiter = (max: number) => {
  const open = new Map<AccountId, number>();
  const release = (accountId: AccountId) => {
    const left = (open.get(accountId) ?? 1) - 1;
    if (left <= 0) open.delete(accountId);
    else open.set(accountId, left);
  };
  return {
    /** Runs `fn` holding one slot, always freed in `finally` (error or abort included). */
    async withConnection<T>(
      accountId: AccountId,
      fn: () => Promise<T>,
    ): Promise<Result<T, RateLimited>> {
      const count = open.get(accountId) ?? 0;
      if (count >= max) return err(new RateLimited());
      open.set(accountId, count + 1);
      try {
        return ok(await fn());
      } finally {
        release(accountId);
      }
    },
  };
};
