import { StorageError } from "@pochimail/kernel/errors";

export const SECRET_FAILURES = [
  /** The OS cannot protect the value (no keychain, or Linux basic_text without the user's choice). Nothing was written. */
  "protection-unavailable",
  /** The stored data cannot be decrypted or parsed. */
  "corrupted",
  /** The main-process service did not answer (worker or main is gone). */
  "unreachable",
  "failed",
] as const;
export type SecretFailure = (typeof SECRET_FAILURES)[number];

/** Typed failure of the secret store. The message is fixed text per reason: it never carries a key, a value or a cause. */
export class SecretStoreError extends StorageError {
  readonly reason: SecretFailure;
  constructor(reason: SecretFailure) {
    super(`Secret store: ${reason}`);
    this.reason = reason;
  }
}
