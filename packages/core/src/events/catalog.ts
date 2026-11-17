import { z } from "zod";
import { providerKindSchema } from "../domain/account.ts";
import { ACTION_KINDS } from "../domain/action.ts";
import { categorySchema, signalKindSchema } from "../domain/category.ts";
import {
  accountIdSchema,
  actionIdSchema,
  actionLogIdSchema,
  attachmentIdSchema,
  confidenceSchema,
  messageIdSchema,
  suggestionIdSchema,
  timestampSchema,
  workspaceIdSchema,
} from "../domain/common.ts";
import { ERROR_CODES } from "../errors.ts";

/**
 * Payloads carry IDs, enums and counts only: never subjects, addresses or bodies (AGENTS §5).
 * Objects are non-strict on purpose: zod strips unknown keys, so a stray `subject` never
 * reaches a subscriber.
 */
const count = z.number().int().nonnegative();

function defineEvent<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    /** Unique per occurrence: at-least-once delivery means consumers dedupe on it (ADR 0003). */
    id: z.string().min(1),
    type: z.literal(type),
    /** Bumped when this event's payload shape changes. */
    version: z.literal(1),
    workspaceId: workspaceIdSchema,
    occurredAt: timestampSchema,
    payload,
  });
}

const actionRef = { actionId: actionIdSchema, actionLogId: actionLogIdSchema };

/**
 * Names follow brief §5.3 exactly. Deviation: `AccountStateChanged` is not in the brief's list;
 * it is kept because the UI needs reauth/paused states (ticket scope: "account state changed").
 */
export const ACCOUNT_STATES = [
  "connected",
  "syncing",
  "needs_reauth",
  "paused",
  "disconnected",
] as const;

export const domainEventSchema = z.discriminatedUnion("type", [
  defineEvent(
    "AccountConnected",
    z.object({ accountId: accountIdSchema, provider: providerKindSchema }),
  ),
  defineEvent(
    "AccountStateChanged",
    z.object({ accountId: accountIdSchema, state: z.enum(ACCOUNT_STATES) }),
  ),
  defineEvent("SyncBatchFetched", z.object({ accountId: accountIdSchema, fetched: count })),
  defineEvent("MessagesUpserted", z.object({ accountId: accountIdSchema, count })),
  defineEvent(
    "MessageClassified",
    z.object({
      accountId: accountIdSchema,
      messageId: messageIdSchema,
      category: categorySchema,
      confidence: confidenceSchema,
    }),
  ),
  defineEvent(
    "SignalDetected",
    z.object({ messageId: messageIdSchema, kind: signalKindSchema, confidence: confidenceSchema }),
  ),
  defineEvent(
    "SuggestionCreated",
    z.object({
      suggestionId: suggestionIdSchema,
      accountId: accountIdSchema,
      kind: z.enum(ACTION_KINDS),
      messageCount: count,
    }),
  ),
  defineEvent("SuggestionApproved", z.object({ suggestionId: suggestionIdSchema })),
  defineEvent(
    "ActionApplied",
    z.object({ ...actionRef, kind: z.enum(ACTION_KINDS), messageCount: count }),
  ),
  defineEvent(
    "ActionFailed",
    z.object({ actionId: actionIdSchema, errorCode: z.enum(ERROR_CODES) }),
  ),
  defineEvent("ActionUndone", z.object(actionRef)),
  defineEvent(
    "AttachmentSaved",
    z.object({ attachmentId: attachmentIdSchema, messageId: messageIdSchema }),
  ),
  defineEvent(
    "ScanProgressed",
    z.object({ accountId: accountIdSchema, processed: count, total: count.optional() }),
  ),
  defineEvent("ScanCompleted", z.object({ accountId: accountIdSchema, processed: count })),
  defineEvent("DigestReady", z.object({ itemCount: count })),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent["type"];
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
