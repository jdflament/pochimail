import type { StorageError } from "@pochimail/core/errors";
import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  type SettingsStore,
} from "@pochimail/core/ports/settings-store";
import { err, ok } from "@pochimail/core/result";
import { createFaults, type Faults } from "./faults.ts";

export interface InMemorySettingsStore extends SettingsStore {
  readonly faults: Faults<StorageError>;
}

export function createInMemorySettingsStore(): InMemorySettingsStore {
  const saved = new Map<string, AppSettings>();
  const faults = createFaults<StorageError>();
  return {
    faults,
    async get(workspaceId) {
      const failure = faults.take();
      return failure ? err(failure) : ok({ ...(saved.get(workspaceId) ?? DEFAULT_APP_SETTINGS) });
    },
    async save(workspaceId, settings) {
      const failure = faults.take();
      if (failure) return err(failure);
      saved.set(workspaceId, { ...settings });
      return ok(undefined);
    },
  };
}
