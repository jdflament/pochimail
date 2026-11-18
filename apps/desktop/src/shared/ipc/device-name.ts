import type { DeviceName } from "@pochimail/core/ports/platform";

const DEVICE_BY_OS: Readonly<Record<string, DeviceName>> = {
  darwin: "Mac",
  macos: "Mac",
  win32: "PC",
  windows: "PC",
};

/** Unknown, empty or non-string OS input yields the neutral name, never "undefined". */
export const deviceNameFromOS = (os: unknown): DeviceName =>
  typeof os === "string" ? (DEVICE_BY_OS[os.toLowerCase()] ?? "device") : "device";
