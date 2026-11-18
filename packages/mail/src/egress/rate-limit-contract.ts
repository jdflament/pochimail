import { RateLimited } from "@pochimail/core/errors";
import { AccountId } from "@pochimail/core/ids";
import { unwrap } from "@pochimail/core/result";
import { type Check, check, registerContract } from "@pochimail/testing/contract";
import { createFakeClock, type FakeClock } from "@pochimail/testing/fake-clock";
import { expect } from "vitest";
import { type HttpClient, type HttpResponse, RequestCancelledError } from "./http-client.ts";
import {
  MAX_RETRY_AFTER_MS,
  type RateLimitEvent,
  type RateLimitedClient,
  type RateLimitedRequest,
  type Sleep,
} from "./rate-limit.ts";

export interface RateLimitHarnessDeps {
  readonly inner: HttpClient;
  readonly clock: FakeClock;
  readonly random: () => number;
  readonly sleep: Sleep;
  readonly onEvent: (event: RateLimitEvent) => void;
}

export interface RateLimitHarness {
  readonly client: RateLimitedClient;
  readonly clock: FakeClock;
  setRandom(value: number): void;
  /** Queue the next transport answers; once empty every call answers 200. */
  respond(...responses: readonly Partial<HttpResponse>[]): void;
  /** Requests that reached the transport, with the fake time they were sent at. */
  calls(): readonly { readonly url: string; readonly at: number }[];
  /** Every wait the client asked for (fake time advances by it, nothing really sleeps). */
  sleeps(): readonly number[];
  events(): readonly RateLimitEvent[];
}

export type RateLimitHarnessFactory = (deps: RateLimitHarnessDeps) => RateLimitedClient;

const A = unwrap(AccountId("acc-a"));
const B = unwrap(AccountId("acc-b"));
const gmail = (id = A) => ({ id, provider: "gmail" as const });
const get = (account = gmail(), extra: Partial<RateLimitedRequest> = {}): RateLimitedRequest => ({
  url: "https://gmail.googleapis.com/v1/messages",
  account,
  ...extra,
});
const throttled = (retryAfter?: string): Partial<HttpResponse> => ({
  status: 429,
  ok: false,
  ...(retryAfter === undefined ? {} : { retryAfter }),
});

export const rateLimitChecks: readonly Check<RateLimitHarness>[] = [
  check("waits for the bucket to refill instead of calling out beyond a burst", async (h) => {
    const t0 = h.clock.now().getTime();
    // Gmail bucket: 6,000 units. Spend it with 300 × messages.get (20 units), then one more.
    for (let i = 0; i < 300; i++) await h.client.request(get(gmail(), { cost: 20 }));
    expect(h.sleeps()).toEqual([]);
    await h.client.request(get(gmail(), { cost: 20 }));
    expect(h.sleeps()).toEqual([200]); // 20 units at 100 units/second
    expect(h.calls().at(-1)?.at).toBe(t0 + 200);
  }),

  check(
    "turns Retry-After seconds into RateLimited with the right retryAfterMs and resumeAt",
    async (h) => {
      h.respond(throttled("30"));
      const t0 = h.clock.now().getTime();
      const result = await h.client.request(get());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RateLimited);
        expect((result.error as RateLimited).retryAfterMs).toBe(30_000);
      }
      expect(h.events()).toEqual([
        {
          type: "RateLimited",
          provider: "Google",
          accountId: A,
          providerKind: "gmail",
          resumeAt: t0 + 30_000,
        },
      ]);
      expect(h.calls()).toHaveLength(1); // honoured, not retried inline
    },
  ),

  check("turns a Retry-After HTTP-date into the same wait as seconds", async (h) => {
    h.respond(throttled(new Date(h.clock.now().getTime() + 45_000).toUTCString()));
    const result = await h.client.request(get());
    if (result.ok) throw new Error("expected RateLimited");
    expect((result.error as RateLimited).retryAfterMs).toBe(45_000);
  }),

  check("caps a huge or non-finite Retry-After so resumeAt stays finite and bounded", async (h) => {
    for (const value of ["9".repeat(400), "999999999999", "86400"]) {
      h.clock.advance(MAX_RETRY_AFTER_MS + 1); // previous cooldown has ended
      h.respond(throttled(value));
      const result = await h.client.request(get());
      if (result.ok) throw new Error("expected RateLimited");
      const { retryAfterMs } = result.error as RateLimited;
      expect(Number.isFinite(retryAfterMs)).toBe(true);
      expect(retryAfterMs).toBeLessThanOrEqual(MAX_RETRY_AFTER_MS);
    }
    for (const e of h.events()) {
      if (e.type === "RateLimited") expect(Number.isSafeInteger(e.resumeAt)).toBe(true);
    }
  }),

  check(
    "treats a garbage Retry-After as absent and backs off instead of trusting Date.parse",
    async (h) => {
      for (const value of ["-5", "soon", "Infinity", "1e9", "30 seconds"]) {
        h.respond(throttled(value), { status: 200, ok: true });
        const result = await h.client.request(get());
        expect(result.ok, value).toBe(true);
      }
      expect(h.sleeps()).toHaveLength(5);
    },
  ),

  check(
    "treats a Retry-After date in the past as retry-now with backoff, not a pause",
    async (h) => {
      h.respond(throttled(new Date(h.clock.now().getTime() - 60_000).toUTCString()), {
        status: 200,
        ok: true,
      });
      expect((await h.client.request(get())).ok).toBe(true);
      expect(h.events()).toEqual([]);
    },
  ),

  check("keeps backoff delays inside the jitter bounds at both random extremes", async (h) => {
    h.setRandom(0);
    h.respond(throttled(), { status: 200, ok: true });
    await h.client.request(get());
    h.setRandom(1);
    h.respond(throttled(), { status: 200, ok: true });
    await h.client.request(get());
    expect(h.sleeps()).toEqual([500, 1_000]);
  }),

  check("makes no calls for a throttled account until its Retry-After has passed", async (h) => {
    h.respond(throttled("30"));
    await h.client.request(get());
    h.clock.advance(10_000);
    const during = await h.client.request(get());
    expect(during.ok).toBe(false);
    if (!during.ok) expect((during.error as RateLimited).retryAfterMs).toBe(20_000);
    expect(h.calls()).toHaveLength(1);
    h.clock.advance(20_000);
    expect((await h.client.request(get())).ok).toBe(true);
  }),

  check("emits SyncResumed once, after the first success following a RateLimited", async (h) => {
    h.respond(throttled("5"));
    await h.client.request(get());
    h.clock.advance(5_000);
    await h.client.request(get());
    await h.client.request(get());
    expect(h.events().map((e) => e.type)).toEqual(["RateLimited", "SyncResumed"]);
  }),

  check(
    "one throttled account does not slow another (buckets and cooldowns are per account)",
    async (h) => {
      h.respond(throttled("60"));
      await h.client.request(get(gmail(A)));
      const other = await h.client.request(get(gmail(B)));
      expect(other.ok).toBe(true);
      expect(h.sleeps()).toEqual([]);
      for (let i = 0; i < 300; i++) await h.client.request(get(gmail(B), { cost: 20 }));
      // A's own bucket is untouched by B's burst.
      h.clock.advance(60_000);
      const before = h.sleeps().length;
      await h.client.request(get(gmail(A), { cost: 20 }));
      expect(h.sleeps()).toHaveLength(before);
    },
  ),

  check(
    "retries an idempotent request with growing, jittered, bounded delays when no Retry-After is sent",
    async (h) => {
      h.respond(throttled(), throttled(), throttled(), { status: 200, ok: true });
      const result = await h.client.request(get());
      expect(result.ok).toBe(true);
      const [d1, d2, d3] = h.sleeps();
      // Core policy: delay for attempt n lies in [ceiling/2, ceiling], ceiling = 1000 * 2^(n-1).
      expect(d1).toBeGreaterThanOrEqual(500);
      expect(d1).toBeLessThanOrEqual(1_000);
      expect(d2).toBeGreaterThanOrEqual(1_000);
      expect(d2).toBeLessThanOrEqual(2_000);
      expect(d3).toBeGreaterThanOrEqual(2_000);
      expect(d3).toBeLessThanOrEqual(4_000);
      expect(h.calls()).toHaveLength(4);
    },
  ),

  check(
    "gives up with RateLimited after bounded attempts instead of retrying forever",
    async (h) => {
      h.respond(...Array.from({ length: 50 }, () => throttled()));
      const result = await h.client.request(get());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(RateLimited);
      expect(h.calls().length).toBeLessThanOrEqual(5);
    },
  ),

  check("never retries a non-idempotent request that was throttled", async (h) => {
    h.respond(throttled(), { status: 200, ok: true });
    const result = await h.client.request(get(gmail(), { method: "POST", body: "{}" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RateLimited);
    expect(h.calls()).toHaveLength(1);
    expect(h.sleeps()).toEqual([]);
  }),

  check("stops waiting for the bucket when the caller cancels, and spends nothing", async (h) => {
    for (let i = 0; i < 300; i++) await h.client.request(get(gmail(), { cost: 20 }));
    const controller = new AbortController();
    controller.abort();
    const cancelled = await h.client.request(get(gmail(), { cost: 20, signal: controller.signal }));
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.error).toBeInstanceOf(RequestCancelledError);
    expect(h.calls()).toHaveLength(300);
  }),

  check("cancels a backoff wait through the AbortSignal", async (h) => {
    const controller = new AbortController();
    h.respond(throttled());
    const pending = h.client.request(get(gmail(), { signal: controller.signal }));
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestCancelledError);
    expect(h.calls()).toHaveLength(1);
  }),
];

/** Registers every check with a fresh fake clock and scripted transport. Shared by all adapters. */
export const registerRateLimitContract = (make: RateLimitHarnessFactory): void => {
  registerContract("RateLimitedClient contract", rateLimitChecks, () => {
    const clock = createFakeClock();
    const queue: Partial<HttpResponse>[] = [];
    const calls: { url: string; at: number }[] = [];
    const sleeps: number[] = [];
    const events: RateLimitEvent[] = [];
    const inner: HttpClient = {
      async request(request) {
        calls.push({ url: request.url, at: clock.now().getTime() });
        const next = queue.shift() ?? {};
        return { ok: true, value: { status: 200, ok: true, body: "", ...next } };
      },
    };
    // Fake time: a sleep advances the clock; nothing really waits. Abort wins before time passes.
    const sleep: Sleep = async (ms, signal) => {
      if (signal?.aborted === true) return false;
      sleeps.push(ms);
      clock.advance(ms);
      return true;
    };
    // Deterministic jitter at the midpoint of the allowed range.
    let randomValue = 0.5;
    const random = () => randomValue;
    return {
      client: make({ inner, clock, random, sleep, onEvent: (e) => events.push(e) }),
      clock,
      setRandom: (v) => {
        randomValue = v;
      },
      respond: (...r) => void queue.push(...r),
      calls: () => calls,
      sleeps: () => sleeps,
      events: () => events,
    };
  });
};
