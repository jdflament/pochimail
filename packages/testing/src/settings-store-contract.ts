import type { WorkspaceId } from "@pochimail/core/ids";
import { DEFAULT_APP_SETTINGS, type SettingsStore } from "@pochimail/core/ports/settings-store";
import { unwrap } from "@pochimail/core/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

const WS_1 = "ws-1" as WorkspaceId;
const WS_2 = "ws-2" as WorkspaceId;

export const settingsStoreChecks: readonly Check<SettingsStore>[] = [
  check(
    "a workspace that never saved gets the safe defaults (guards Autopilot being on after first run)",
    async (s) => {
      expect(unwrap(await s.get(WS_1))).toEqual(DEFAULT_APP_SETTINGS);
      expect(DEFAULT_APP_SETTINGS.autopilot).toBe(false);
    },
  ),
  check(
    "saved settings are read back and stay inside their workspace (guards one workspace changing another's Autopilot)",
    async (s) => {
      await s.save(WS_1, { autopilot: true, notifications: false });
      expect(unwrap(await s.get(WS_1))).toEqual({ autopilot: true, notifications: false });
      expect(unwrap(await s.get(WS_2))).toEqual(DEFAULT_APP_SETTINGS);
    },
  ),
];

/** Contract for any `SettingsStore` (in-memory today; the SQLite adapter reuses it). `make` returns a fresh, empty store. */
export function settingsStoreContract(make: () => SettingsStore | Promise<SettingsStore>): void {
  registerContract("SettingsStore contract", settingsStoreChecks, make);
}
