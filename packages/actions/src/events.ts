import { ERROR_CODES, type ErrorCode } from "@pochimail/kernel/errors";
import { defineEvent } from "@pochimail/kernel/event-schema";
import { z } from "zod";
import { ACTION_KINDS, type ActionLog, actionIdSchema, actionLogIdSchema } from "./model/action.ts";

const count = z.number().int().nonnegative();
const actionRef = { actionId: actionIdSchema, actionLogId: actionLogIdSchema };

export const actionAppliedEvent = defineEvent(
  "ActionApplied",
  z.object({ ...actionRef, kind: z.enum(ACTION_KINDS), messageCount: count }),
);
export const actionFailedEvent = defineEvent(
  "ActionFailed",
  z.object({ actionId: actionIdSchema, errorCode: z.enum(ERROR_CODES) }),
);
export const actionUndoneEvent = defineEvent("ActionUndone", z.object(actionRef));
export const actionEvents = [actionAppliedEvent, actionFailedEvent, actionUndoneEvent] as const;

type ActionApplied = z.infer<typeof actionAppliedEvent>;
type ActionFailed = z.infer<typeof actionFailedEvent>;
type ActionUndone = z.infer<typeof actionUndoneEvent>;
type ActionEventType = "ActionApplied" | "ActionFailed" | "ActionUndone";
type ActionEventOf<T extends ActionEventType> = T extends "ActionApplied"
  ? ActionApplied
  : T extends "ActionFailed"
    ? ActionFailed
    : ActionUndone;

/**
 * Builds the catalog event for a log entry (ids, enums and counts only, AGENTS §5). The event id
 * is the log entry id, so at-least-once delivery stays idempotent per entry.
 */
export function actionEvent(
  type: "ActionFailed",
  entry: ActionLog,
  errorCode: ErrorCode,
): ActionFailed;
export function actionEvent(
  type: "ActionApplied" | "ActionUndone",
  entry: ActionLog,
): ActionApplied | ActionUndone;
export function actionEvent(
  type: ActionEventType,
  entry: ActionLog,
  errorCode?: ErrorCode,
): ActionEventOf<ActionEventType> {
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
