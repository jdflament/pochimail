import { schemaVersion, topicIdSchema, workspaceIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";

export const topicSchema = z.object({
  schemaVersion,
  id: topicIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1),
});
export type Topic = z.infer<typeof topicSchema>;
