import type { AsyncResult } from "@pochimail/kernel/common";
import type { Cancelled, ErrorCode, StorageError } from "@pochimail/kernel/errors";
import { actionEvent } from "../events.ts";
import type { ActionLog } from "../model/action.ts";
import type { ActionsUnitOfWork } from "../ports/unit-of-work.ts";

export interface RecordEntryRequest {
  readonly entry: ActionLog;
  readonly type: "ActionApplied" | "ActionFailed" | "ActionUndone";
  readonly errorCode?: ErrorCode;
}

/** Appends one log entry and its event in a single transaction (ADR 0003 outbox). */
export class RecordEntry {
  constructor(private readonly deps: { readonly uow: ActionsUnitOfWork }) {}

  execute({
    entry,
    type,
    errorCode,
  }: RecordEntryRequest): AsyncResult<void, StorageError | Cancelled> {
    return this.deps.uow.run(async (tx) => {
      const appended = await tx.repositories.actionLog.append(entry);
      if (!appended.ok) return appended;
      return tx.events.append([
        type === "ActionFailed"
          ? actionEvent(type, entry, errorCode ?? "domain.invalid_state")
          : actionEvent(type, entry),
      ]);
    });
  }
}
