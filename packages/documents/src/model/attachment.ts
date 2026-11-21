import {
  brandedId,
  messageIdSchema,
  schemaVersion,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";
import { AttachmentId } from "../ids.ts";

export const attachmentIdSchema = brandedId(AttachmentId);

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
