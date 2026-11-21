import { InvalidStateError } from "@pochimail/kernel/errors";
import { type Brand, makeId } from "@pochimail/kernel/ids";
import { err, ok, type Result } from "@pochimail/kernel/result";
import {
  accountIdSchema,
  brandedId,
  messageIdSchema,
  schemaVersion,
  timestampSchema,
  workspaceIdSchema,
} from "@pochimail/kernel/schemas";
import { z } from "zod";
import { confidenceSchema, reasonsSchema } from "./scores.ts";

export type SuggestionId = Brand<string, "SuggestionId">;
export const SuggestionId = makeId<SuggestionId>("SuggestionId");
export const suggestionIdSchema = brandedId(SuggestionId);

/** What a recommendation proposes today; a kind is added with the use case that proposes it. */
export const RECOMMENDATION_KINDS = ["archive", "unsubscribe"] as const;
export const recommendationKindSchema = z.enum(RECOMMENDATION_KINDS);
export type RecommendationKind = z.infer<typeof recommendationKindSchema>;

export const recommendationSchema = z.object({
  kind: recommendationKindSchema,
  messageIds: z.array(messageIdSchema).min(1),
  label: z.string().min(1).optional(),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

export const suggestionSchema = z.object({
  schemaVersion,
  id: suggestionIdSchema,
  workspaceId: workspaceIdSchema,
  accountId: accountIdSchema,
  recommendation: recommendationSchema,
  reasons: reasonsSchema,
  confidence: confidenceSchema,
  state: z.enum(["pending", "approved", "dismissed"]),
  createdAt: timestampSchema,
});
export type Suggestion = z.infer<typeof suggestionSchema>;

/** Validated constructor: returns an `Err` rather than throwing for bad input. */
export function createSuggestion(input: unknown): Result<Suggestion, InvalidStateError> {
  const parsed = suggestionSchema.safeParse(input);
  return parsed.success
    ? ok(parsed.data)
    : err(new InvalidStateError("Suggestion needs reasons and a confidence between 0 and 1"));
}
