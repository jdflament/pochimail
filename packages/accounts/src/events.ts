import { defineEvent } from "@pochimail/kernel/event-schema";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { accountIdSchema } from "@pochimail/kernel/schemas";
import { z } from "zod";
import { providerKindSchema } from "./model/account.ts";

/**
 * Names follow brief §5.3 exactly. Deviation: `AccountStateChanged` is not in the brief's list;
 * it is kept because the UI needs reauth/paused states (ticket scope: "account state changed").
 */
export const ACCOUNT_STATES = [
  "connected",
  "syncing",
  "needs_reauth",
  "paused",
  "disconnected",
] as const;

export const accountConnectedEvent = defineEvent(
  "AccountConnected",
  z.object({ accountId: accountIdSchema, provider: providerKindSchema }),
);
export const accountStateChangedEvent = defineEvent(
  "AccountStateChanged",
  z.object({ accountId: accountIdSchema, state: z.enum(ACCOUNT_STATES) }),
);
export const accountEvents = [accountConnectedEvent, accountStateChangedEvent] as const;

export type AccountConnected = z.infer<typeof accountConnectedEvent>;
export type AccountStateChanged = z.infer<typeof accountStateChangedEvent>;
export type AccountState = AccountStateChanged["payload"]["state"];

/**
 * The one way to build an `AccountStateChanged` event, so connect, sync, re-auth and removal cannot
 * drift apart (id shape, version, payload). The id stays unique per account, state and moment.
 */
export const accountStateEvent = (input: {
  readonly workspaceId: WorkspaceId;
  readonly accountId: z.infer<typeof accountIdSchema>;
  readonly state: AccountState;
  readonly occurredAt: string;
}): AccountStateChanged => ({
  id: `account-state:${input.accountId}:${input.state}:${input.occurredAt}`,
  type: "AccountStateChanged",
  version: 1,
  workspaceId: input.workspaceId,
  occurredAt: input.occurredAt,
  payload: { accountId: input.accountId, state: input.state },
});
