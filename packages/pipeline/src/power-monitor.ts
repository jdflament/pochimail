import type { Unsubscribe } from "@pochimail/kernel/common";

export const THERMAL_STATES = ["nominal", "fair", "serious", "critical"] as const;
export type ThermalState = (typeof THERMAL_STATES)[number];

export interface PowerState {
  readonly onBattery: boolean;
  readonly thermal: ThermalState;
  readonly online: boolean;
  readonly asleep: boolean;
}

/** Lets background work pause on sleep, offline, battery or heat. Reads are infallible. */
export interface PowerMonitor {
  current(): PowerState;
  onChange(listener: (state: PowerState) => void): Unsubscribe;
}
