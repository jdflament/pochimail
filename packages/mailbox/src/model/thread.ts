import {
  accountIdSchema,
  messageIdSchema,
  schemaVersion,
  threadIdSchema,
  timestampSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";

export const threadSchema = z.object({
  schemaVersion,
  id: threadIdSchema,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  subject: z.string(),
  messageIds: z.array(messageIdSchema).min(1),
  lastMessageAt: timestampSchema,
});
export type Thread = z.infer<typeof threadSchema>;
