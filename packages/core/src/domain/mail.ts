import { z } from "zod";
import { categorySchema, signalKindSchema, suspiciousFlagSchema } from "./category.ts";
import {
  accountIdSchema,
  attachmentIdSchema,
  confidenceSchema,
  messageIdSchema,
  schemaVersion,
  threadIdSchema,
  timestampSchema,
  topicIdSchema,
  workspaceIdSchema,
} from "./common.ts";

// PRIVATE MAIL DATA: Message and Thread hold subjects, addresses and snippets.
// Never log them, and never add their field names to the logger's safe-key allow-list.

/** A fetched message before classification: no category yet. */
export const incomingMessageSchema = z.object({
  schemaVersion,
  id: messageIdSchema,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  threadId: threadIdSchema,
  from: z.email(),
  to: z.array(z.email()),
  subject: z.string(),
  snippet: z.string(),
  receivedAt: timestampSchema,
  hasListUnsubscribe: z.boolean(),
  opened: z.boolean(),
  topicIds: z.array(topicIdSchema),
  suspicious: suspiciousFlagSchema.optional(),
});
export type IncomingMessage = z.infer<typeof incomingMessageSchema>;

/** A classified message: exactly one category (brief §3). */
export const messageSchema = incomingMessageSchema.extend({ category: categorySchema });
export type Message = z.infer<typeof messageSchema>;

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

export const signalSchema = z.object({
  schemaVersion,
  workspaceId: workspaceIdSchema,
  messageId: messageIdSchema,
  kind: signalKindSchema,
  confidence: confidenceSchema,
  detectedAt: timestampSchema,
});
export type Signal = z.infer<typeof signalSchema>;
