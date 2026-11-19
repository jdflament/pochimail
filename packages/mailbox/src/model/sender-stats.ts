import {
  accountIdSchema,
  schemaVersion,
  timestampSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";

export const senderStatsSchema = z.object({
  schemaVersion,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  address: z.email(),
  messageCount: z.int().nonnegative(),
  openedCount: z.int().nonnegative(),
  repliedCount: z.int().nonnegative(),
  lastMessageAt: timestampSchema,
  vip: z.boolean(),
});
export type SenderStats = z.infer<typeof senderStatsSchema>;
