import { z } from "zod";
import { AccountId, MessageId, ThreadId, TopicId, WorkspaceId } from "./ids.ts";
import type { Result } from "./result.ts";

/** Bumped when a persisted entity's shape changes; adapters migrate on read. */
export const SCHEMA_VERSION = 1;
export const schemaVersion = z.literal(SCHEMA_VERSION);

/** Reuses the id validators so a schema accepts exactly what the constructors accept. */
export function brandedId<T extends string>(make: (raw: unknown) => Result<T, Error>) {
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
export const topicIdSchema = brandedId(TopicId);

/** ISO-8601 instant, kept as a string so entities are JSON-safe by construction. */
export const timestampSchema = z.iso.datetime();
