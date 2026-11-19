import { DomainError } from "@pochimail/kernel/errors";

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
