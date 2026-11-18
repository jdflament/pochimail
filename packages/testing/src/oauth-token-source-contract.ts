import type { OAuthTokenSource } from "@pochimail/core/ports/oauth";
import type { SecretStore } from "@pochimail/core/ports/secret-store";
import { afterAll, expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import type { FakeClock } from "./fake-clock.ts";
import type { FakeOAuthServer } from "./fake-oauth-server.ts";

/** What an `OAuthTokenSource` suite needs. Real providers (M2) run it unchanged. */
export interface OAuthTokenSourceHarness {
  readonly source: OAuthTokenSource;
  readonly server: FakeOAuthServer;
  readonly secrets: SecretStore;
  /** The clock the source reads, so expiry can be advanced. */
  readonly clock: FakeClock;
  readonly secretKey: string;
  /** The refresh token stored under `secretKey`. */
  readonly refreshToken: string;
}

const live = () => new AbortController().signal;

export const oauthTokenSourceChecks: readonly Check<OAuthTokenSourceHarness>[] = [
  check(
    "a refresh the provider rejects surfaces AuthExpired, not a retryable error (guards a silent retry loop on a dead token)",
    async (h) => {
      expect((await h.source.token(live())).ok).toBe(true);
      h.server.revokeRefreshToken(h.refreshToken);
      h.clock.advance(2 * 60 * 60 * 1000);
      const refreshed = await h.source.refresh(live());
      expect(refreshed.ok).toBe(false);
      if (!refreshed.ok) expect(refreshed.error.name).toBe("AuthExpired");
    },
  ),
  check(
    "an unexpired access token is reused instead of fetched again per call (guards a token request on every API call)",
    async (h) => {
      expect((await h.source.token(live())).ok).toBe(true);
      const before = h.server.refreshRequests();
      expect((await h.source.token(live())).ok).toBe(true);
      expect(h.server.refreshRequests()).toBe(before);
    },
  ),
  check(
    "an expired access token is refreshed exactly once with a new value (guards requests carrying a dead bearer token)",
    async (h) => {
      const first = await h.source.token(live());
      expect(first.ok).toBe(true);
      const before = h.server.refreshRequests();
      h.clock.advance(2 * 60 * 60 * 1000);
      const second = await h.source.token(live());
      expect(second.ok).toBe(true);
      expect(h.server.refreshRequests()).toBe(before + 1);
      if (first.ok && second.ok) expect(second.value.token).not.toBe(first.value.token);
    },
  ),
  check(
    "a missing stored refresh token fails AuthExpired without calling the provider (guards refreshing with an empty credential)",
    async (h) => {
      expect((await h.secrets.remove(h.secretKey)).ok).toBe(true);
      const before = h.server.requests().length;
      const refreshed = await h.source.refresh(live());
      expect(refreshed.ok).toBe(false);
      if (!refreshed.ok) expect(refreshed.error.name).toBe("AuthExpired");
      expect(h.server.requests().length).toBe(before);
    },
  ),
];

/** Registers the suite; `make` must return a fresh harness (fresh fake server and store) per check. */
export const runOAuthTokenSourceContract = (
  make: () => OAuthTokenSourceHarness | Promise<OAuthTokenSourceHarness>,
): void => {
  const servers: FakeOAuthServer[] = [];
  registerContract("OAuthTokenSource contract", oauthTokenSourceChecks, async () => {
    const harness = await make();
    servers.push(harness.server);
    return harness;
  });
  afterAll(async () => {
    for (const server of servers) await server.close();
  });
};
