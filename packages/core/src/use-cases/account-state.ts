import type { DomainEventOf } from "../events/catalog.ts";
import type { AccountId, WorkspaceId } from "../ids.ts";

export type AccountState = DomainEventOf<"AccountStateChanged">["payload"]["state"];

/**
 * The one way to build an `AccountStateChanged` event, so connect, sync, re-auth and removal cannot
 * drift apart (id shape, version, payload). The id stays unique per account, state and moment.
 */
export const accountStateEvent = (input: {
  readonly workspaceId: WorkspaceId;
  readonly accountId: AccountId;
  readonly state: AccountState;
  readonly occurredAt: string;
}): DomainEventOf<"AccountStateChanged"> => ({
  id: `account-state:${input.accountId}:${input.state}:${input.occurredAt}`,
  type: "AccountStateChanged",
  version: 1,
  workspaceId: input.workspaceId,
  occurredAt: input.occurredAt,
  payload: { accountId: input.accountId, state: input.state },
});
