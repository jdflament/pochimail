import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import type { Cancelled, StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";

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
