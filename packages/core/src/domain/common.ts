import { brandedId } from "@pochimail/kernel/schemas";
import { z } from "zod";
import { ActionId, ActionLogId, AttachmentId, SuggestionId } from "../ids.ts";

export const actionIdSchema = brandedId(ActionId);
export const suggestionIdSchema = brandedId(SuggestionId);
export const attachmentIdSchema = brandedId(AttachmentId);
export const actionLogIdSchema = brandedId(ActionLogId);

export const confidenceSchema = z.number().min(0).max(1);
export const reasonsSchema = z.array(z.string().min(1)).min(1);
