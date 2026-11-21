import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import type { StoredSignal } from "../model/signal.ts";

export interface SignalReader {
  /** Stored signals of the given messages, sorted by message id then kind. */
  listForMessages(
    ws: WorkspaceId,
    messageIds: readonly MessageId[],
  ): AsyncResult<readonly StoredSignal[], StorageError>;
}
export interface SignalWriter {
  /**
   * One row per message and signal kind. Replaces every stored signal of `messageIds` with
   * `signals`, so a signal that no longer applies disappears and a re-run changes nothing.
   */
  replaceForMessages(
    ws: WorkspaceId,
    messageIds: readonly MessageId[],
    signals: readonly StoredSignal[],
  ): AsyncResult<void, StorageError>;
}
export type SignalRepository = SignalReader & SignalWriter;
