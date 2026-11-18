import type { StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult } from "./common.ts";

/** Workspace-wide preferences the Settings screen edits. Defaults are the safe ones: suggest only, counts-only notifications. */
export interface AppSettings {
  readonly autopilot: boolean;
  readonly notifications: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { autopilot: false, notifications: true };

export interface SettingsStore {
  /** Returns the defaults until something was saved. */
  get(workspaceId: WorkspaceId): AsyncResult<AppSettings, StorageError>;
  /** Replaces the stored settings. */
  save(workspaceId: WorkspaceId, settings: AppSettings): AsyncResult<void, StorageError>;
}
