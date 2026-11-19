import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";

/** OS keychain. Values (tokens, keys) never reach a log or a file. */
export interface SecretStore {
  /** `null` when the secret does not exist. */
  get(key: string): AsyncResult<string | null, StorageError>;
  set(key: string, value: string): AsyncResult<void, StorageError>;
  remove(key: string): AsyncResult<void, StorageError>;
}
