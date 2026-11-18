import type { StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AutonomyLevel } from "../policies/autonomy.ts";
import type { AsyncResult } from "./common.ts";

/** Workspace-wide preferences the Settings screen edits. Defaults are the safe ones: suggest only, counts-only notifications. */
export interface AppSettings {
  /** Brief §2, question 2. */
  readonly autonomy: AutonomyLevel;
  /** Brief §2, question 1: which jobs the assistant may do. All on by default. */
  readonly capabilities: Capabilities;
  readonly notifications: boolean;
}

export const CAPABILITIES = [
  "catch-what-matters",
  "declutter",
  "organize",
  "save-documents",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Capabilities = { readonly [K in Capability]: boolean };

export const DEFAULT_CAPABILITIES: Capabilities = {
  "catch-what-matters": true,
  declutter: true,
  organize: true,
  "save-documents": true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autonomy: "suggest",
  capabilities: DEFAULT_CAPABILITIES,
  notifications: true,
};

export interface SettingsStore {
  /** Returns the defaults until something was saved. */
  get(workspaceId: WorkspaceId): AsyncResult<AppSettings, StorageError>;
  /** Replaces the stored settings. */
  save(workspaceId: WorkspaceId, settings: AppSettings): AsyncResult<void, StorageError>;
}
