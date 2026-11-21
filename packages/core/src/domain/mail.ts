import {
  messageIdSchema,
  schemaVersion,
  topicIdSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";
import { attachmentIdSchema } from "./common.ts";

export const attachmentSchema = z.object({
  schemaVersion,
  id: attachmentIdSchema,
  workspaceId: workspaceIdSchema,
  messageId: messageIdSchema,
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const topicSchema = z.object({
  schemaVersion,
  id: topicIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1),
});
export type Topic = z.infer<typeof topicSchema>;
