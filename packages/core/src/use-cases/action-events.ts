import type { ActionLog } from "../domain/action.ts";
import type { ErrorCode } from "../errors.ts";
import type { DomainEventOf } from "../events/catalog.ts";

type ActionEventType = "ActionApplied" | "ActionFailed" | "ActionUndone";

/**
 * Builds the catalog event for a log entry (ids, enums and counts only, AGENTS §5). The event id
 * is the log entry id, so at-least-once delivery stays idempotent per entry.
 */
export function actionEvent(
  type: "ActionFailed",
  entry: ActionLog,
  errorCode: ErrorCode,
): DomainEventOf<"ActionFailed">;
export function actionEvent(
  type: "ActionApplied" | "ActionUndone",
  entry: ActionLog,
): DomainEventOf<"ActionApplied" | "ActionUndone">;
export function actionEvent(
  type: ActionEventType,
  entry: ActionLog,
  errorCode?: ErrorCode,
): DomainEventOf<ActionEventType> {
  const head = {
    id: entry.id,
    version: 1 as const,
    workspaceId: entry.workspaceId,
    occurredAt: entry.at,
  };
  if (type === "ActionFailed") {
    return {
      ...head,
      type,
      payload: { actionId: entry.actionId, errorCode: errorCode ?? "domain.invalid_state" },
    };
  }
  const ref = { actionId: entry.actionId, actionLogId: entry.id };
  return type === "ActionUndone"
    ? { ...head, type, payload: ref }
    : {
        ...head,
        type,
        payload: {
          ...ref,
          kind: entry.command.kind,
          messageCount: entry.command.messageIds.length,
        },
      };
}
