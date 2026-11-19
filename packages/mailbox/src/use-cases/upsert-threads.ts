import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok } from "@pochimail/kernel/result";
import type { IncomingMessage } from "../model/message.ts";
import type { Thread } from "../model/thread.ts";
import type { MailboxTransaction } from "../ports/unit-of-work.ts";

const NOT_FOUND = "storage.not_found";

/** Oldest first; equal times fall back to the id so the order is stable. */
function byReceipt(times: ReadonlyMap<string, string>) {
  return (a: string, b: string): number => {
    const ta = times.get(a) ?? "";
    const tb = times.get(b) ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  };
}

/**
 * Keeps one `Thread` per stored message's thread, in the same transaction as the batch (the
 * caller's `tx`). Message ids stay in arrival order (the last one is the newest), so a replay or
 * an out-of-order batch never duplicates or reorders. Subject and ids only: no body (D11).
 */
export class UpsertThreads {
  async execute(
    tx: MailboxTransaction,
    messages: readonly IncomingMessage[],
  ): AsyncResult<void, StorageError> {
    const byThread = new Map<string, IncomingMessage[]>();
    for (const m of messages) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
    for (const added of byThread.values()) {
      const saved = await this.upsertOne(tx, added);
      if (!saved.ok) return saved;
    }
    return ok(undefined);
  }

  private async upsertOne(
    tx: MailboxTransaction,
    added: readonly IncomingMessage[],
  ): AsyncResult<void, StorageError> {
    const first = added[0];
    if (!first) return ok(undefined);
    const found = await tx.repositories.threads.get(first.workspaceId, first.threadId);
    if (!found.ok && found.error.code !== NOT_FOUND) return found;
    const existing = found.ok ? found.value : null;
    const times = await this.receiptTimes(tx, first.workspaceId, added, existing);
    if (!times.ok) return times;
    const ids = [...new Set([...(existing?.messageIds ?? []), ...added.map((m) => m.id)])];
    ids.sort(byReceipt(times.value));
    const earliest = added.find((m) => m.id === ids[0]) ?? first;
    const thread: Thread = {
      schemaVersion: 1,
      id: first.threadId,
      workspaceId: first.workspaceId,
      accountId: first.accountId,
      subject: existing?.subject ?? earliest.subject,
      messageIds: ids as [Thread["messageIds"][number], ...Thread["messageIds"]],
      lastMessageAt: times.value.get(ids.at(-1) ?? "") ?? first.receivedAt,
    };
    return tx.repositories.threads.upsert(thread);
  }

  /** Receipt time of every message in the thread, for ordering: known ones from the store. */
  private async receiptTimes(
    tx: MailboxTransaction,
    ws: WorkspaceId,
    added: readonly IncomingMessage[],
    existing: Thread | null,
  ): AsyncResult<Map<string, string>, StorageError> {
    const times = new Map<string, string>(added.map((m) => [m.id, m.receivedAt]));
    for (const id of existing?.messageIds ?? []) {
      if (times.has(id)) continue;
      const row = await tx.repositories.messages.get(ws, id);
      if (row.ok) times.set(id, row.value.receivedAt);
      else if (row.error.code !== NOT_FOUND) return err(row.error);
    }
    return ok(times);
  }
}
