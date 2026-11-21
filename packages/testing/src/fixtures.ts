import type { Account } from "@pochimail/accounts/model/account";
import type { ActionId, ActionLogId } from "@pochimail/actions/ids";
import type { ActionLog } from "@pochimail/actions/model/action";
import type { Topic } from "@pochimail/classification/model/topic";
import type { AccountId, MessageId, ThreadId, TopicId, WorkspaceId } from "@pochimail/kernel/ids";
import type { IncomingMessage } from "@pochimail/mailbox/model/message";
import type { SenderStats } from "@pochimail/mailbox/model/sender-stats";
import type { Thread } from "@pochimail/mailbox/model/thread";

// Fake data only: every address is on example.com and every text is invented.

export const WS_A = "ws-a" as WorkspaceId;
export const WS_B = "ws-b" as WorkspaceId;
export const ACCOUNT_1 = "acc-1" as AccountId;
const AT = "2026-01-01T00:00:00.000Z";

export const makeAccount = (over: Partial<Account> = {}): Account => ({
  schemaVersion: 1,
  id: ACCOUNT_1,
  workspaceId: WS_A,
  provider: "gmail",
  address: "owner@example.com",
  connectedAt: AT,
  grantedScopes: [],
  ...over,
});

export const makeIncomingMessage = (
  n: number,
  over: Partial<IncomingMessage> = {},
): IncomingMessage => ({
  schemaVersion: 1,
  id: `msg-${n}` as MessageId,
  workspaceId: WS_A,
  accountId: ACCOUNT_1,
  threadId: `thr-${n}` as ThreadId,
  from: "sender@example.com",
  to: ["owner@example.com"],
  subject: `Subject ${n}`,
  snippet: `Snippet ${n}`,
  // Later numbers are more recent, so ordering assertions are easy to read.
  receivedAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
  hasListUnsubscribe: false,
  opened: false,
  topicIds: [],
  ...over,
});

export const makeThread = (over: Partial<Thread> = {}): Thread => ({
  schemaVersion: 1,
  id: "thr-1" as ThreadId,
  workspaceId: WS_A,
  accountId: ACCOUNT_1,
  subject: "Subject 1",
  messageIds: ["msg-1" as MessageId],
  lastMessageAt: AT,
  ...over,
});

export const makeSender = (over: Partial<SenderStats> = {}): SenderStats => ({
  schemaVersion: 1,
  workspaceId: WS_A,
  accountId: ACCOUNT_1,
  address: "sender@example.com",
  messageCount: 3,
  openedCount: 1,
  repliedCount: 0,
  lastMessageAt: AT,
  vip: false,
  ...over,
});

export const makeTopic = (over: Partial<Topic> = {}): Topic => ({
  schemaVersion: 1,
  id: "topic-1" as TopicId,
  workspaceId: WS_A,
  name: "Trips",
  ...over,
});

export const makeActionLog = (n: number, over: Partial<ActionLog> = {}): ActionLog => ({
  schemaVersion: 1,
  id: `log-${n}` as ActionLogId,
  workspaceId: WS_A,
  actionId: "act-1" as ActionId,
  idempotencyKey: `key-${n}`,
  outcome: "applied",
  command: { kind: "archive", messageIds: ["msg-1" as MessageId] },
  inverse: { kind: "unarchive", messageIds: ["msg-1" as MessageId] },
  irreversible: false,
  at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
  ...over,
});
