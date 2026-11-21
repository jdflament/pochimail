import { deviceNameFromOS } from "./ipc/device-name.ts";
import type { OperatingSystem, Platform } from "./platform-port.ts";

const OS: Readonly<Record<string, OperatingSystem>> = {
  darwin: "macos",
  macos: "macos",
  win32: "windows",
  windows: "windows",
  linux: "linux",
};

/** Node's `process.platform` values (and any unknown string) map to the core port's OS union. */
export const operatingSystemFromOS = (os: unknown): OperatingSystem =>
  typeof os === "string" ? (OS[os.toLowerCase()] ?? "linux") : "linux";

/** The desktop Platform adapter: facts only, no secrets, no logging, no network. */
export const createPlatformAdapter = (os: unknown, dataDirectory: string): Platform => ({
  os: operatingSystemFromOS(os),
  deviceName: () => deviceNameFromOS(os),
  dataDirectory: () => dataDirectory,
});
