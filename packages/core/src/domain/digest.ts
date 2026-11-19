import {
  accountIdSchema,
  messageIdSchema,
  schemaVersion,
  timestampSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";
import { categorySchema, signalKindSchema } from "./category.ts";

/**
 * The "what's new" summary (brief §7): only mail that arrived after `since`, never totals of
 * old mail. Holds ids, counts and signal kinds, no subjects or addresses.
 */
export const digestSchema = z.object({
  schemaVersion,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  since: timestampSchema,
  generatedAt: timestampSchema,
  newMessageCount: z.int().nonnegative(),
  byCategory: z.partialRecord(categorySchema, z.int().positive()),
  /** New messages that need attention, with the signal that says why. */
  attention: z.array(z.object({ messageId: messageIdSchema, kind: signalKindSchema })),
});
export type Digest = z.infer<typeof digestSchema>;
