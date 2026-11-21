import { defineEvent } from "@pochimail/kernel/event-schema";
import { messageIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";
import { attachmentIdSchema } from "./model/attachment.ts";

export const attachmentSavedEvent = defineEvent(
  "AttachmentSaved",
  z.object({ attachmentId: attachmentIdSchema, messageId: messageIdSchema }),
);
export const documentEvents = [attachmentSavedEvent] as const;
