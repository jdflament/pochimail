import type { Cancelled, StorageError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "./common.ts";

export interface ExportRequest {
  readonly workspaceId: WorkspaceId;
  readonly scope: "action-log" | "senders" | "all";
  readonly format: "json" | "csv";
}

export interface ExportedFile {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export interface Exporter {
  export(
    request: ExportRequest,
    signal: CancelSignal,
  ): AsyncResult<ExportedFile, StorageError | Cancelled>;
}
