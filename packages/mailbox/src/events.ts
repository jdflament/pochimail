import { defineEvent } from "@pochimail/kernel/event-schema";
import { accountIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";

const count = z.number().int().nonnegative();

export const syncBatchFetchedEvent = defineEvent(
  "SyncBatchFetched",
  z.object({ accountId: accountIdSchema, fetched: count }),
);
export const messagesUpsertedEvent = defineEvent(
  "MessagesUpserted",
  z.object({ accountId: accountIdSchema, count }),
);
export const mailboxEvents = [syncBatchFetchedEvent, messagesUpsertedEvent] as const;

export type MessagesUpserted = z.infer<typeof messagesUpsertedEvent>;
