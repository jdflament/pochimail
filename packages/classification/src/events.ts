import { defineEvent } from "@pochimail/kernel/event-schema";
import { accountIdSchema, messageIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";
import { categorySchema, signalKindSchema } from "./model/category.ts";
import { confidenceSchema } from "./model/scores.ts";

export const messageClassifiedEvent = defineEvent(
  "MessageClassified",
  z.object({
    accountId: accountIdSchema,
    messageId: messageIdSchema,
    category: categorySchema,
    confidence: confidenceSchema,
  }),
);
export const signalDetectedEvent = defineEvent(
  "SignalDetected",
  z.object({ messageId: messageIdSchema, kind: signalKindSchema, confidence: confidenceSchema }),
);
export const classificationEvents = [messageClassifiedEvent, signalDetectedEvent] as const;

export type MessageClassified = z.infer<typeof messageClassifiedEvent>;
export type SignalDetected = z.infer<typeof signalDetectedEvent>;
