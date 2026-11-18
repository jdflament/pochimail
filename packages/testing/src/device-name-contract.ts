import { DEVICE_NAMES, type DeviceName } from "@pochimail/core/ports/platform";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

export type DeviceNameFor = (os: unknown) => DeviceName;

/** Reusable by the desktop adapter and any M2 platform adapter: no adapter-specific imports. */
export const deviceNameChecks: readonly Check<DeviceNameFor>[] = [
  check(
    "falls back to 'device' when the OS is missing or unknown (guards 'undefined' in copy)",
    async (deviceName) => {
      for (const os of [undefined, "", 42, "plan9"]) expect(deviceName(os)).toBe("device");
    },
  ),
  check("calls macOS 'Mac' and Windows 'PC' (guards 'your Mac' on a PC)", async (deviceName) => {
    expect(deviceName("darwin")).toBe("Mac");
    expect(deviceName("win32")).toBe("PC");
  }),
  check(
    "only ever returns a catalog device name (guards raw OS strings leaking into the UI)",
    async (deviceName) => {
      for (const os of ["darwin", "win32", "linux", undefined, "plan9"])
        expect(DEVICE_NAMES).toContain(deviceName(os));
    },
  ),
];

/** Contract for any OS-to-device-name mapping. */
export function deviceNameContract(make: () => DeviceNameFor): void {
  registerContract("Device name contract", deviceNameChecks, make);
}
