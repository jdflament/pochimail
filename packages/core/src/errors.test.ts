import { Cancelled, DomainError, EventError, StorageError } from "@pochimail/kernel/errors";
import { expect, it } from "vitest";
import {
  AiUnavailable,
  AuthExpired,
  Conflict,
  NotFound,
  Offline,
  ProviderError,
  RateLimited,
} from "./errors.ts";

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

// Guards: port callers branch on these codes, and every one must be catchable as a DomainError.
it("exposes stable codes for storage, AI, cancellation and event failures", () => {
  const errors = [
    new StorageError(),
    new NotFound("Topic"),
    new AiUnavailable(),
    new Cancelled(),
    new EventError(),
  ];
  expect(errors.map((e) => e.code)).toEqual([
    "storage.failed",
    "storage.not_found",
    "ai.unavailable",
    "operation.cancelled",
    "event.invalid",
  ]);
  for (const e of errors) {
    expect(e).toBeInstanceOf(DomainError);
    expect(e).not.toBeInstanceOf(ProviderError);
  }
  expect(new EventError()).not.toBeInstanceOf(StorageError);
});
