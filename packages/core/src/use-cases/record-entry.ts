import type { AsyncResult } from "@pochimail/kernel/common";
import type { Cancelled, ErrorCode, StorageError } from "@pochimail/kernel/errors";
import type { ActionLog } from "../domain/action.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { actionEvent } from "./action-events.ts";

/** Appends one log entry and its event in a single transaction (ADR 0003 outbox). */
export function recordEntry(
  uow: UnitOfWork,
  entry: ActionLog,
  type: "ActionApplied" | "ActionFailed" | "ActionUndone",
  errorCode?: ErrorCode,
): AsyncResult<void, StorageError | Cancelled> {
  return uow.run(async (tx) => {
    const appended = await tx.repositories.actionLog.append(entry);
    if (!appended.ok) return appended;
    return tx.outbox.append({
      kind: "event",
      event:
        type === "ActionFailed"
          ? actionEvent(type, entry, errorCode ?? "domain.invalid_state")
          : actionEvent(type, entry),
    });
  });
}
