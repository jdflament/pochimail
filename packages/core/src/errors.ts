/** Closed set of stable error codes. The logger lets only these through under a `code` key. */
export const ERROR_CODES = [
  "domain.invalid_id",
  "domain.invalid_state",
  "policy.denied",
  "provider.rate_limited",
  "provider.offline",
  "provider.auth_expired",
  "provider.conflict",
  "provider.failed",
  "auth.sign_in_cancelled",
  "auth.invalid_callback",
  "auth.missing_client_config",
  "storage.failed",
  "storage.not_found",
  "ai.unavailable",
  "operation.cancelled",
  "event.invalid",
  "event.handler_failed",
  "event.handler_timeout",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Base of all expected failures. `code` is stable and safe to log; `message` must carry no PII. */
export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidIdError extends DomainError {
  readonly kind: string;

  constructor(kind: string, reason: string) {
    super("domain.invalid_id", `Invalid ${kind}: ${reason}`);
    this.kind = kind;
  }
}

export class InvalidStateError extends DomainError {
  constructor(message: string) {
    super("domain.invalid_state", message);
  }
}

/** Failures reported by (or while reaching) a mail provider. */
export abstract class ProviderError extends DomainError {}

export class RateLimited extends ProviderError {
  readonly retryAfterMs: number | undefined;

  constructor(options: { retryAfterMs?: number } = {}) {
    super("provider.rate_limited", "Provider rate limit reached");
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class Offline extends ProviderError {
  constructor() {
    super("provider.offline", "Provider is unreachable");
  }
}

export class AuthExpired extends ProviderError {
  constructor() {
    super("provider.auth_expired", "Provider credentials expired");
  }
}

export class Conflict extends ProviderError {
  constructor(message = "Provider state changed since it was last read") {
    super("provider.conflict", message);
  }
}

/** The provider answered, but not acceptably (a rejected token exchange, an unexpected body). */
export class ProviderFailed extends ProviderError {
  constructor(message = "Provider request failed") {
    super("provider.failed", message);
  }
}

/** The user cancelled sign-in or its 5-minute window closed. Expected, never alarming. */
export class SignInCancelled extends DomainError {
  constructor() {
    super("auth.sign_in_cancelled", "Sign-in cancelled");
  }
}

export const INVALID_CALLBACK_REASONS = [
  "state-mismatch",
  "provider-error",
  "missing-code",
] as const;
export type InvalidCallbackReason = (typeof INVALID_CALLBACK_REASONS)[number];

/** A loopback callback that must not be trusted. `reason` is a closed set, safe to log. */
export class InvalidCallback extends DomainError {
  readonly reason: InvalidCallbackReason;

  constructor(reason: InvalidCallbackReason) {
    super("auth.invalid_callback", `Invalid sign-in callback: ${reason}`);
    this.reason = reason;
  }
}

/** A build without a client id for this provider; the provider is a closed value, safe to log. */
export class MissingClientConfig extends DomainError {
  readonly provider: string;

  constructor(provider: string) {
    super("auth.missing_client_config", `No OAuth client id configured for ${provider}`);
    this.provider = provider;
  }
}

/** A repository, blob store, secret store or queue could not complete the operation. */
export class StorageError extends DomainError {
  constructor(message = "Storage operation failed", options?: { cause?: unknown }) {
    super("storage.failed", message, options);
  }
}

export class NotFound extends DomainError {
  constructor(what: string) {
    super("storage.not_found", `${what} not found`);
  }
}

/** The local model is missing, still loading or crashed. */
export class AiUnavailable extends DomainError {
  constructor(message = "Local AI is unavailable") {
    super("ai.unavailable", message);
  }
}

/** The caller's `AbortSignal` fired; the operation stopped and changed nothing further. */
export class Cancelled extends DomainError {
  constructor() {
    super("operation.cancelled", "Operation cancelled");
  }
}

/** The event failed validation against the catalog, so it was not delivered. */
export class EventError extends DomainError {
  constructor(message = "Event is invalid") {
    super("event.invalid", message);
  }
}

export const POLICY_DENIAL_REASONS = [
  "unknown-action-kind",
  "read-only",
  "needs-confirmation",
  "protected-category",
  "unknown-category",
  "below-confidence-threshold",
  "not-autopilot-eligible",
] as const;
export type PolicyDenialReason = (typeof POLICY_DENIAL_REASONS)[number];

/** An action refused by policy. `reason` is a closed set, safe to log. */
export class PolicyDenied extends DomainError {
  readonly reason: PolicyDenialReason;

  constructor(reason: PolicyDenialReason) {
    super("policy.denied", `Action denied by policy: ${reason}`);
    this.reason = reason;
  }
}
