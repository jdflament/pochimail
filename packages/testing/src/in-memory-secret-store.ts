import type { SecretStore } from "@pochimail/core/ports/secret-store";
import type { StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "./faults.ts";

export interface InMemorySecretStore extends SecretStore {
  readonly faults: Faults<StorageError>;
}

export function createInMemorySecretStore(): InMemorySecretStore {
  const secrets = new Map<string, string>();
  const faults = createFaults<StorageError>();
  return {
    faults,
    async get(key) {
      const failure = faults.take();
      return failure ? err(failure) : ok(secrets.get(key) ?? null);
    },
    async set(key, value) {
      const failure = faults.take();
      if (failure) return err(failure);
      secrets.set(key, value);
      return ok(undefined);
    },
    async remove(key) {
      const failure = faults.take();
      if (failure) return err(failure);
      secrets.delete(key);
      return ok(undefined);
    },
  };
}
