import { Offline, RateLimited } from "@pochimail/core/errors";
import type { DomainEvent } from "@pochimail/core/events/catalog";
import { AccountId } from "@pochimail/core/ids";
import type { MailProvider } from "@pochimail/core/ports/mail-provider";
import { err, ok, unwrap } from "@pochimail/core/result";
import { ConnectAccount } from "@pochimail/core/use-cases/connect-account";
import { RunIncrementalSync } from "@pochimail/core/use-cases/run-incremental-sync";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import { makeIncomingMessage, WS_A } from "@pochimail/testing/fixtures";
import { createInMemorySecretStore } from "@pochimail/testing/in-memory-secret-store";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { expect, it } from "vitest";
import type { HttpClient } from "./http-client.ts";
import { createConnectionLimiter, createRateLimitedClient } from "./rate-limit.ts";
import { registerRateLimitContract } from "./rate-limit-contract.ts";

registerRateLimitContract(({ inner, clock, random, sleep, onEvent }) =>
  createRateLimitedClient({ inner, clock, random, sleep, onEvent }),
);

it("refuses a second IMAP connection beyond the per-account limit and frees it on release", () => {
  const limiter = createConnectionLimiter(1);
  const id = unwrap(AccountId("acc-imap"));
  const first = limiter.tryAcquire(id);
  expect(first.ok).toBe(true);
  const second = limiter.tryAcquire(id);
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.error).toBeInstanceOf(RateLimited);
  if (first.ok) first.value();
  expect(limiter.tryAcquire(id).ok).toBe(true);
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
