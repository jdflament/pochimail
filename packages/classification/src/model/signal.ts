import {
  messageIdSchema,
  schemaVersion,
  timestampSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";
import { signalKindSchema } from "./category.ts";
import { confidenceSchema } from "./scores.ts";

export const signalSchema = z.object({
  schemaVersion,
  workspaceId: workspaceIdSchema,
  messageId: messageIdSchema,
  kind: signalKindSchema,
  confidence: confidenceSchema,
  detectedAt: timestampSchema,
});
export type Signal = z.infer<typeof signalSchema>;

/** A signal as stored: the rule's fixed reason text (never mail content) travels with it. */
export type StoredSignal = Signal & { readonly reason: string };
