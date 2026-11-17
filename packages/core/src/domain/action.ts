import { z } from "zod";
import { ERROR_CODES, InvalidStateError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import {
  accountIdSchema,
  actionIdSchema,
  actionLogIdSchema,
  confidenceSchema,
  messageIdSchema,
  reasonsSchema,
  schemaVersion,
  suggestionIdSchema,
  timestampSchema,
  workspaceIdSchema,
} from "./common.ts";

/** There is deliberately no delete kind: mail is archived, never deleted (brief §2). */
export const ACTION_KINDS = [
  "archive",
  "unarchive",
  "apply-label",
  "remove-label",
  "mark-handled",
  "unmark-handled",
  "unsubscribe",
] as const;
export const actionKindSchema = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const commandSchema = z.object({
  kind: actionKindSchema,
  messageIds: z.array(messageIdSchema).min(1),
  label: z.string().min(1).optional(),
});
export type Command = z.infer<typeof commandSchema>;

export const suggestionSchema = z.object({
  schemaVersion,
  id: suggestionIdSchema,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  command: commandSchema,
  reasons: reasonsSchema,
  confidence: confidenceSchema,
  state: z.enum(["pending", "approved", "dismissed"]),
  createdAt: timestampSchema,
});
export type Suggestion = z.infer<typeof suggestionSchema>;

/** Validated constructor: returns an `Err` rather than throwing for bad input. */
export function createSuggestion(input: unknown): Result<Suggestion, InvalidStateError> {
  const parsed = suggestionSchema.safeParse(input);
  return parsed.success
    ? ok(parsed.data)
    : err(new InvalidStateError("Suggestion needs reasons and a confidence between 0 and 1"));
}

/** The intent: what to do. What was actually done, and how to undo it, lives on the ActionLog. */
export const actionSchema = z.object({
  schemaVersion,
  id: actionIdSchema,
  workspaceId: workspaceIdSchema,
  suggestionId: suggestionIdSchema.optional(),
  idempotencyKey: z.string().min(1),
  command: commandSchema,
  createdAt: timestampSchema,
});
export type Action = z.infer<typeof actionSchema>;

/**
 * Brief §5.3: the log records what was actually done plus its inverse, so undo never guesses.
 * The one explicit exception is unsubscribe: it cannot be reversed, so the entry says so
 * (`inverse: null`, `irreversible: true`, with a reason). Any other applied entry needs an inverse.
 * A failed entry changed nothing, so it has nothing to undo.
 */
export const actionLogSchema = z
  .object({
    schemaVersion,
    id: actionLogIdSchema,
    workspaceId: workspaceIdSchema,
    actionId: actionIdSchema,
    outcome: z.enum(["applied", "failed", "undone"]),
    command: commandSchema,
    inverse: commandSchema.nullable(),
    irreversible: z.boolean(),
    irreversibleReason: z.string().min(1).optional(),
    errorCode: z.enum(ERROR_CODES).optional(),
    at: timestampSchema,
  })
  .superRefine((log, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });
    const noUndoNeeded = log.outcome === "failed";
    if (log.irreversible) {
      if (log.command.kind !== "unsubscribe")
        fail("only unsubscribe may be irreversible", "irreversible");
      if (log.inverse !== null) fail("an irreversible entry has no inverse", "inverse");
      if (!log.irreversibleReason)
        fail("an irreversible entry needs a reason", "irreversibleReason");
    } else {
      if (log.irreversibleReason !== undefined)
        fail("reason only applies to irreversible", "irreversibleReason");
      if (log.inverse === null && !noUndoNeeded)
        fail("a reversible action must record its inverse", "inverse");
    }
  });
export type ActionLog = z.infer<typeof actionLogSchema>;
