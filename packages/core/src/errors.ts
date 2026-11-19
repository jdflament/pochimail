import { DomainError } from "@pochimail/kernel/errors";

/** The local model is missing, still loading or crashed. */
export class AiUnavailable extends DomainError {
  constructor(message = "Local AI is unavailable") {
    super("ai.unavailable", message);
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
