import { z } from "zod";
import { timestampSchema, workspaceIdSchema } from "./schemas.ts";

/**
 * The one way to declare an event: the envelope every domain shares plus its own payload.
 * Payloads carry IDs, enums and counts only: never subjects, addresses or bodies. Objects are
 * non-strict on purpose: zod strips unknown keys, so a stray `subject` never reaches a subscriber.
 */
export function defineEvent<T extends string, P extends z.ZodType>(type: T, payload: P) {
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
