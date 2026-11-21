import type { Account } from "@pochimail/accounts/model/account";
import type { SignalFacts } from "@pochimail/classification/model/message-facts";
import type { SignalFactsSource } from "@pochimail/classification/ports/message-source";
import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { AccountId, MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import type { Message } from "@pochimail/mailbox/model/message";
import type { ReadRepositories } from "../ports/repositories.ts";

type Reads = Pick<ReadRepositories, "accounts" | "messages" | "threads" | "senders">;

/** What the sender's statistics say; a sender never seen has no statistics. */
async function senderOf(
  reads: Reads,
  ws: WorkspaceId,
  accountId: AccountId,
  message: Message,
): AsyncResult<{ vip: boolean; repliedCount: number }, StorageError> {
  const stats = await reads.senders.get(ws, accountId, message.from);
  if (stats.ok) return ok(stats.value);
  if (stats.error.code === "storage.not_found") return ok({ vip: false, repliedCount: 0 });
  return err(stats.error);
}

/** Threads are optional context: a message without a stored thread is a thread of one. */
async function endsThread(
  reads: Reads,
  ws: WorkspaceId,
  message: Message,
): AsyncResult<boolean, StorageError> {
  const thread = await reads.threads.get(ws, message.threadId);
  if (thread.ok) return ok(thread.value.messageIds.at(-1) === message.id);
  if (thread.error.code === "storage.not_found") return ok(true);
  return err(thread.error);
}

async function factsOf(
  reads: Reads,
  ws: WorkspaceId,
  owner: Account,
  message: Message,
): AsyncResult<SignalFacts, StorageError> {
  const sender = await senderOf(reads, ws, owner.id, message);
  if (!sender.ok) return sender;
  const last = await endsThread(reads, ws, message);
  if (!last.ok) return last;
  return ok({
    messageId: message.id,
    from: message.from,
    subject: message.subject,
    snippet: message.snippet,
    storedCategory: message.category,
    receivedAt: message.receivedAt,
    opened: message.opened,
    ownerAddress: owner.address,
    lastInThread: last.value,
    senderVip: sender.value.vip,
    senderRepliedCount: sender.value.repliedCount,
  });
}

/**
 * Composition until `workflows` exists: classification's plain-data view of a message, read from
 * the accounts, mailbox and sender rows. Every adapter (SQLite, in-memory) builds it the same way.
 */
export function signalFactsOver(reads: Reads): SignalFactsSource {
  return {
    async forMessages(ws, accountId, ids: readonly MessageId[]) {
      const account = await reads.accounts.get(ws, accountId);
      if (!account.ok) return account;
      const out: SignalFacts[] = [];
      for (const id of ids) {
        const message = await reads.messages.get(ws, id);
        if (!message.ok) return message;
        if (message.value.accountId !== accountId) continue;
        const facts = await factsOf(reads, ws, account.value, message.value);
        if (!facts.ok) return facts;
        out.push(facts.value);
      }
      return ok(out);
    },
  };
}
