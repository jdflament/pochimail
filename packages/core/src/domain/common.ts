import { brandedId } from "@pochimail/kernel/schemas";
import { ActionId, ActionLogId, AttachmentId } from "../ids.ts";

export const actionIdSchema = brandedId(ActionId);
export const attachmentIdSchema = brandedId(AttachmentId);
export const actionLogIdSchema = brandedId(ActionLogId);
