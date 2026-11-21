import type { OAuthTokenSource } from "@pochimail/accounts/ports/oauth";
import { createGmailProvider, type GmailProvider } from "@pochimail/gmail/provider";
import { ok } from "@pochimail/kernel/result";
import type { IncomingMessage } from "@pochimail/mailbox/model/message";
import { egressPolicy } from "@pochimail/net/egress/allowlist";
import { createHttpClient } from "@pochimail/net/egress/http-client";
import { createRateLimitedClient } from "@pochimail/net/egress/rate-limit";
import type { MailProvider } from "@pochimail/workflows/ports/mail-provider";
import { createFakeClock } from "../fake-clock.ts";
import { createFakeGmailServer, type FakeGmailServer } from "../fake-gmail-server.ts";
import { ACCOUNT_1, WS_A } from "../fixtures.ts";

export interface GmailHarness {
  readonly server: FakeGmailServer;
  readonly provider: GmailProvider;
  readonly clock: ReturnType<typeof createFakeClock>;
  /** Mail arriving at the invented mailbox, from the records the shared contracts build. */
  deliver(...messages: IncomingMessage[]): void;
}

const tokens = (): OAuthTokenSource => {
  const at = { token: "access-1", expiresAt: "2099-01-01T00:00:00.000Z", scopes: [] as string[] };
  return {
    token: async () => ok(at),
    refresh: async () => ok({ ...at, token: "access-2" }),
  };
};

/** The adapter over the invented Gmail, through net's real allow-listed, rate-limited client. */
export function createGmailHarness(options: { pageSize?: number } = {}): GmailHarness {
  const server = createFakeGmailServer();
  const clock = createFakeClock();
  const http = createRateLimitedClient({
    inner: createHttpClient({ allowlist: egressPolicy.create(), fetch: server.fetch }),
    clock,
    random: () => 0,
    sleep: async () => true,
  });
  const provider = createGmailProvider({
    workspaceId: WS_A,
    accountId: ACCOUNT_1,
    http,
    tokens: tokens(),
    ...(options.pageSize === undefined ? {} : { sync: { pageSize: options.pageSize } }),
  });
  return {
    server,
    provider,
    clock,
    deliver: (...messages) => {
      for (const m of messages) server.add(m);
    },
  };
}

/**
 * Gmail can only return mail of the account it is connected to, while the shared contracts also
 * deliver other workspaces' mail to check it is never stored. This wrapper re-stamps each message
 * with the owner the contract gave it, so the contract sees what it asked for.
 */
export function withOwners(
  provider: GmailProvider,
  owners: Map<string, Pick<IncomingMessage, "workspaceId" | "accountId">>,
): MailProvider {
  return {
    ...provider,
    sync: async (cursor, signal) => {
      const batch = await provider.sync(cursor, signal);
      if (!batch.ok) return batch;
      return ok({
        ...batch.value,
        messages: batch.value.messages.map((m) => ({ ...m, ...owners.get(m.id) })),
      });
    },
  };
}
