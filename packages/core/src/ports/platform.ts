export const OPERATING_SYSTEMS = ["macos", "windows", "linux"] as const;
export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];

/** Copy never hard-codes "Mac": it uses `deviceName()` (brief §5.9). */
export const DEVICE_NAMES = ["Mac", "PC", "computer"] as const;
export type DeviceName = (typeof DEVICE_NAMES)[number];

/** Infallible, synchronous facts about the host, so they return plain values, not `Result`. */
export interface Platform {
  readonly os: OperatingSystem;
  deviceName(): DeviceName;
  /** Where the app keeps its data; opaque to core. */
  dataDirectory(): string;
}
