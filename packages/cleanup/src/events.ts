import { defineEvent } from "@pochimail/kernel/event-schema";
import { accountIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";
import { recommendationKindSchema, suggestionIdSchema } from "./model/suggestion.ts";

const count = z.number().int().nonnegative();

export const suggestionCreatedEvent = defineEvent(
  "SuggestionCreated",
  z.object({
    suggestionId: suggestionIdSchema,
    accountId: accountIdSchema,
    kind: recommendationKindSchema,
    messageCount: count,
  }),
);
export const suggestionApprovedEvent = defineEvent(
  "SuggestionApproved",
  z.object({ suggestionId: suggestionIdSchema }),
);
export const digestReadyEvent = defineEvent("DigestReady", z.object({ itemCount: count }));
export const cleanupEvents = [
  suggestionCreatedEvent,
  suggestionApprovedEvent,
  digestReadyEvent,
] as const;

export type SuggestionCreated = z.infer<typeof suggestionCreatedEvent>;
export type DigestReady = z.infer<typeof digestReadyEvent>;
