import {
  AuthExpired,
  Conflict,
  DomainError,
  Offline,
  ProviderError,
  RateLimited,
} from "@pochimail/core/errors";
import { expect, it } from "vitest";

// Guards: callers branch on stable codes; renaming a class or message must not change them.
it("exposes stable codes and a shared hierarchy for every provider failure", () => {
  const errors = [new RateLimited(), new Offline(), new AuthExpired(), new Conflict()];
  expect(errors.map((e) => e.code)).toEqual([
    "provider.rate_limited",
    "provider.offline",
    "provider.auth_expired",
    "provider.conflict",
  ]);
  for (const e of errors) {
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toBeInstanceOf(DomainError);
    expect(e).toBeInstanceOf(Error);
  }
});
