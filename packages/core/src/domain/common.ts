import { WorkspaceId } from "@pochimail/kernel/ids";
import type { Result } from "@pochimail/kernel/result";
import { z } from "zod";
import {
  AccountId,
  ActionId,
  ActionLogId,
  AttachmentId,
  MessageId,
  SuggestionId,
  ThreadId,
  TopicId,
} from "../ids.ts";

/** Bumped when a persisted entity's shape changes; adapters migrate on read. */
export const SCHEMA_VERSION = 1;
export const schemaVersion = z.literal(SCHEMA_VERSION);

/** Reuses the M1-01 ID validators so a schema accepts exactly what the constructors accept. */
function brandedId<T extends string>(make: (raw: unknown) => Result<T, Error>) {
  return z.string().transform((raw, ctx): T => {
    const result = make(raw);
    if (result.ok) return result.value;
    ctx.addIssue({ code: "custom", message: result.error.message });
    return z.NEVER;
  });
}

export const workspaceIdSchema = brandedId(WorkspaceId);
export const accountIdSchema = brandedId(AccountId);
export const messageIdSchema = brandedId(MessageId);
export const threadIdSchema = brandedId(ThreadId);
export const actionIdSchema = brandedId(ActionId);
export const suggestionIdSchema = brandedId(SuggestionId);
export const attachmentIdSchema = brandedId(AttachmentId);
export const topicIdSchema = brandedId(TopicId);
export const actionLogIdSchema = brandedId(ActionLogId);

/** ISO-8601 instant, kept as a string so entities are JSON-safe by construction. */
export const timestampSchema = z.iso.datetime();
export const confidenceSchema = z.number().min(0).max(1);
export const reasonsSchema = z.array(z.string().min(1)).min(1);
