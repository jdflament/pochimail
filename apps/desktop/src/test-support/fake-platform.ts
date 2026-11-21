import type { DeviceName, OperatingSystem, Platform } from "../shared/platform-port.ts";

const DEVICE: Record<OperatingSystem, DeviceName> = {
  macos: "Mac",
  windows: "PC",
  linux: "device",
};

export function createFakePlatform(
  options: { os?: OperatingSystem; dataDirectory?: string } = {},
): Platform {
  const os = options.os ?? "macos";
  const dataDirectory = options.dataDirectory ?? "/fake/pochimail-data";
  return { os, deviceName: () => DEVICE[os], dataDirectory: () => dataDirectory };
}
