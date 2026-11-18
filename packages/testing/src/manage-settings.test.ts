import type { WorkspaceId } from "@pochimail/core/ids";
import type { AppSettings, SettingsStore } from "@pochimail/core/ports/settings-store";
import { unwrap } from "@pochimail/core/result";
import { ManageSettings } from "@pochimail/core/use-cases/manage-settings";
import { expect, it } from "vitest";

const WS = "ws-1" as WorkspaceId;

/** A store that still holds a row written before autonomy and capabilities existed. */
const legacyStore = (row: unknown): SettingsStore & { saved: () => unknown } => {
  let current = row;
  return {
    saved: () => current,
    get: async () => ({ ok: true, value: current as AppSettings }),
    save: async (_ws, settings) => {
      current = settings;
      return { ok: true, value: undefined };
    },
  };
};

it("a legacy autopilot:true row reads as Autopilot with every capability on (guards an undefined autonomy crashing settings.get)", async () => {
  const settings = new ManageSettings({
    store: legacyStore({ autopilot: true, notifications: false }),
  });
  const read = unwrap(await settings.get(WS));
  expect(read.autonomy).toBe("autopilot");
  expect(read.notifications).toBe(false);
  expect(Object.values(read.capabilities)).toEqual([true, true, true, true]);
});

it("a legacy autopilot:false row reads as Suggest (guards the safe default being lost)", async () => {
  const settings = new ManageSettings({
    store: legacyStore({ autopilot: false, notifications: true }),
  });
  expect(unwrap(await settings.get(WS)).autonomy).toBe("suggest");
});

it("updating a legacy row never persists an undefined field (guards a half-migrated row)", async () => {
  const store = legacyStore({ autopilot: false, notifications: true });
  await new ManageSettings({ store }).update(WS, { notifications: false });
  expect(store.saved()).toEqual({
    autonomy: "suggest",
    capabilities: {
      "catch-what-matters": true,
      declutter: true,
      organize: true,
      "save-documents": true,
    },
    notifications: false,
  });
});
