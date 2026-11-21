import { ok } from "@pochimail/kernel/result";
import { type AppSettings, DEFAULT_APP_SETTINGS, type SettingsStore } from "../shared/settings.ts";

/** Settings for this run only: nothing is saved until settings persistence lands (its own issue). */
export const createMemorySettingsStore = (): SettingsStore => {
  let current: AppSettings = DEFAULT_APP_SETTINGS;
  return {
    get: async () => ok(current),
    save: async (_workspaceId, settings) => {
      current = settings;
      return ok(undefined);
    },
  };
};
