import { DEVICE_NAMES, OPERATING_SYSTEMS, type Platform } from "@pochimail/core/ports/platform";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

export const platformChecks: readonly Check<Platform>[] = [
  check(
    "reports a known OS and a known device name (guards copy that hard-codes Mac)",
    async (p) => {
      expect(OPERATING_SYSTEMS).toContain(p.os);
      expect(DEVICE_NAMES).toContain(p.deviceName());
    },
  ),
  check("the device name matches the OS (guards 'your Mac' on Windows)", async (p) => {
    const expected = { macos: "Mac", windows: "PC", linux: "computer" }[p.os];
    expect(p.deviceName()).toBe(expected);
  }),
  check(
    "facts are stable and the data directory is not empty (guards a data path that changes between calls)",
    async (p) => {
      expect(p.dataDirectory().length).toBeGreaterThan(0);
      expect(p.dataDirectory()).toBe(p.dataDirectory());
      expect(p.deviceName()).toBe(p.deviceName());
    },
  ),
];

/** Contract for any `Platform`. */
export function platformContract(make: () => Platform | Promise<Platform>): void {
  registerContract("Platform contract", platformChecks, make);
}
