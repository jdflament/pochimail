import { Offline, RateLimited } from "@pochimail/core/errors";
import type { DomainEvent } from "@pochimail/core/events/catalog";
import { AccountId } from "@pochimail/core/ids";
import type { MailProvider } from "@pochimail/core/ports/mail-provider";
import { ConnectAccount } from "@pochimail/core/use-cases/connect-account";
import { RunIncrementalSync } from "@pochimail/core/use-cases/run-incremental-sync";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import { makeIncomingMessage, WS_A } from "@pochimail/testing/fixtures";
import { createInMemorySecretStore } from "@pochimail/testing/in-memory-secret-store";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HttpClient, RequestCancelledError } from "./http-client.ts";
import { createConnectionLimiter, createRateLimitedClient, systemSleep } from "./rate-limit.ts";
import { registerRateLimitContract } from "./rate-limit-contract.ts";

registerRateLimitContract(({ inner, clock, random, sleep, onEvent }) =>
  createRateLimitedClient({ inner, clock, random, sleep, onEvent }),
);

it("frees the IMAP connection slot after fn throws, so a failure cannot leak a slot", async () => {
  const limiter = createConnectionLimiter(1);
  const id = unwrap(AccountId("acc-imap"));
  await expect(
    limiter.withConnection(id, async () => {
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect((await limiter.withConnection(id, async () => 1)).ok).toBe(true);
});

it("frees the IMAP slot after an aborted operation and refuses a second concurrent connection", async () => {
  const limiter = createConnectionLimiter(1);
  const id = unwrap(AccountId("acc-imap"));
  const controller = new AbortController();
  const running = limiter.withConnection(
    id,
    () =>
      new Promise<void>((_resolve, reject) =>
        controller.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const second = await limiter.withConnection(id, async () => 1);
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.error).toBeInstanceOf(RateLimited);
  controller.abort();
  await expect(running).rejects.toThrow("aborted");
  expect((await limiter.withConnection(id, async () => 1)).ok).toBe(true);
});

describe("a wait that is pending when the caller aborts", () => {
  const account = { id: unwrap(AccountId("acc-wait")), provider: "gmail" as const };
  const setup = (statuses: number[]) => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const inner: HttpClient = {
      async request() {
        calls.push(Date.now());
        const status = statuses.shift() ?? 200;
        return ok({ status, ok: status === 200, body: "" });
      },
    };
    const client = createRateLimitedClient({
      inner,
      clock: { now: () => new Date(Date.now()) },
      random: () => 0.5,
      sleep: systemSleep,
    });
    return { client, calls };
  };
  afterEach(() => vi.useRealTimers());

  it("rejects a bucket wait promptly and sends no request (guards a cancelled sync that still fires)", async () => {
    const { client, calls } = setup([]);
    for (let i = 0; i < 300; i++)
      await client.request({ url: "https://gmail.googleapis.com/v1/m", account, cost: 20 });
    const sent = calls.length;
    const controller = new AbortController();
    const pending = client.request({
      url: "https://gmail.googleapis.com/v1/m",
      account,
      cost: 20,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(50); // part-way through the 200 ms wait
    controller.abort();
    const result = await pending; // settles without advancing time further
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestCancelledError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(sent);
  });

  it("rejects a backoff wait promptly and does not retry (guards a retry after cancel)", async () => {
    const { client, calls } = setup([429]);
    const controller = new AbortController();
    const pending = client.request({
      url: "https://gmail.googleapis.com/v1/m",
      account,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(100); // first call answered 429, now backing off
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(RequestCancelledError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
  });
});

it("RunIncrementalSync pauses the account at Retry-After and resumes once the provider recovers", async () => {
  const clock = createFakeClock();
  const store = createInMemoryUnitOfWork();
  const fake = createFakeMailProvider({ pageSize: 2 });
  let next = 0;
  const connected = unwrap(
    await new ConnectAccount({
      uow: store.uow,
      secrets: createInMemorySecretStore(),
      clock,
      ids: { next: (prefix) => `${prefix}_${++next}` },
    }).execute(
      { workspaceId: WS_A, provider: "gmail", address: "owner@example.com", credentials: "t" },
      new AbortController().signal,
    ),
  );
  const account = connected.account;
  await fake.deliver(makeIncomingMessage(1, { accountId: account.id, workspaceId: WS_A }));

  // The provider adapter's only network call goes through the rate-limited client.
  let throttle = true;
  const inner: HttpClient = {
    async request() {
      const status = throttle ? 429 : 200;
      return ok({ status, ok: !throttle, body: "", ...(throttle ? { retryAfter: "30" } : {}) });
    },
  };
  const client = createRateLimitedClient({
    inner,
    clock,
    random: () => 0.5,
    sleep: async () => true,
  });
  const provider: MailProvider = {
    ...fake,
    capabilities: fake.capabilities,
    async sync(cursor, signal) {
      const response = await client.request({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/history",
        account: { id: account.id, provider: "gmail" },
        cost: 2,
      });
      if (!response.ok) {
        return err(response.error instanceof RateLimited ? response.error : new Offline());
      }
      return fake.sync(cursor, signal);
    },
  };
  const sync = new RunIncrementalSync({ uow: store.uow, provider, clock });
  const startedAt = clock.now().getTime();

  const limited = unwrap(
    await sync.execute({ workspaceId: WS_A, accountId: account.id }, new AbortController().signal),
  );
  expect(limited).toMatchObject({
    status: "rate-limited",
    resumeAt: new Date(startedAt + 30_000).toISOString(),
  });
  const states = (await store.committedOutbox()).flatMap((e) =>
    e.kind === "event" && e.event.type === "AccountStateChanged"
      ? [(e.event as DomainEvent).payload]
      : [],
  );
  expect(states.at(-1)).toMatchObject({ accountId: account.id, state: "paused" });

  throttle = false;
  clock.advance(30_000);
  const resumed = unwrap(
    await sync.execute({ workspaceId: WS_A, accountId: account.id }, new AbortController().signal),
  );
  expect(resumed.status).toBe("completed");
});
