import type { DeviceName, OperatingSystem, Platform } from "@pochimail/core/ports/platform";

const DEVICE: Record<OperatingSystem, DeviceName> = {
  macos: "Mac",
  windows: "PC",
  linux: "computer",
};

export function createFakePlatform(
  options: { os?: OperatingSystem; dataDirectory?: string } = {},
): Platform {
  const os = options.os ?? "macos";
  const dataDirectory = options.dataDirectory ?? "/fake/pochimail-data";
  return { os, deviceName: () => DEVICE[os], dataDirectory: () => dataDirectory };
}
