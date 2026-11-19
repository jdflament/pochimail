import { accountEvents } from "@pochimail/accounts/events";
import { ERROR_CODES } from "@pochimail/kernel/errors";
import { defineEvent } from "@pochimail/kernel/event-schema";
import { accountIdSchema, messageIdSchema } from "@pochimail/kernel/schemas";
import { mailboxEvents } from "@pochimail/mailbox/events";
import { z } from "zod";
import { ACTION_KINDS } from "../domain/action.ts";
import { categorySchema, signalKindSchema } from "../domain/category.ts";
import {
  actionIdSchema,
  actionLogIdSchema,
  attachmentIdSchema,
  confidenceSchema,
  suggestionIdSchema,
} from "../domain/common.ts";

/**
 * Payloads carry IDs, enums and counts only: never subjects, addresses or bodies (AGENTS §5).
 * Objects are non-strict on purpose: zod strips unknown keys, so a stray `subject` never
 * reaches a subscriber.
 */
const count = z.number().int().nonnegative();

const actionRef = { actionId: actionIdSchema, actionLogId: actionLogIdSchema };

export const domainEventSchema = z.discriminatedUnion("type", [
  ...accountEvents,
  ...mailboxEvents,
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
  defineEvent(
    "ScanFailed",
    z.object({ accountId: accountIdSchema, errorCode: z.enum(ERROR_CODES) }),
  ),
  defineEvent("DigestReady", z.object({ itemCount: count })),
]);

export type DomainEvent = z.infer<typeof domainEventSchema>;
export type DomainEventType = DomainEvent["type"];
export type DomainEventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;

/** Validates untrusted input; the bus takes this as its `parse`. */
export function parseDomainEvent(input: unknown): DomainEvent | undefined {
  const parsed = domainEventSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}
