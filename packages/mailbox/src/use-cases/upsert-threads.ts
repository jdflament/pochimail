import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import { ok } from "@pochimail/kernel/result";
import type { IncomingMessage } from "../model/message.ts";
import type { Thread } from "../model/thread.ts";
import type { MailboxTransaction } from "../ports/unit-of-work.ts";

/**
 * Keeps one `Thread` per stored message's thread, in the same transaction as the batch. Message
 * ids stay in arrival order (the last one is the newest), so a replay or an out-of-order
 * batch never duplicates or reorders. Subject and ids only: no body (D11).
 */
export async function upsertThreads(
  tx: MailboxTransaction,
  messages: readonly IncomingMessage[],
): AsyncResult<void, StorageError> {
  const byThread = new Map<string, IncomingMessage[]>();
  for (const m of messages) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);

  for (const added of byThread.values()) {
    const first = added[0];
    if (!first) continue;
    const found = await tx.repositories.threads.get(first.workspaceId, first.threadId);
    if (!found.ok && found.error.code !== "storage.not_found") return found;
    const existing = found.ok ? found.value : null;

    // Receipt time of every message in the thread, for ordering: known ones from the store.
    const times = new Map<string, string>(added.map((m) => [m.id, m.receivedAt]));
    for (const id of existing?.messageIds ?? []) {
      if (times.has(id)) continue;
      const row = await tx.repositories.messages.get(first.workspaceId, id);
      if (!row.ok) {
        if (row.error.code === "storage.not_found") continue;
        return row;
      }
      times.set(id, row.value.receivedAt);
    }
    const ids = [...new Set([...(existing?.messageIds ?? []), ...added.map((m) => m.id)])];
    ids.sort((a, b) => {
      const ta = times.get(a) ?? "";
      const tb = times.get(b) ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : a < b ? -1 : a > b ? 1 : 0;
    });
    const earliest = ids[0] === undefined ? undefined : added.find((m) => m.id === ids[0]);
    const thread: Thread = {
      schemaVersion: 1,
      id: first.threadId,
      workspaceId: first.workspaceId,
      accountId: first.accountId,
      subject: existing?.subject ?? (earliest ?? first).subject,
      messageIds: ids as [Thread["messageIds"][number], ...Thread["messageIds"]],
      lastMessageAt: times.get(ids.at(-1) ?? "") ?? first.receivedAt,
    };
    const saved = await tx.repositories.threads.upsert(thread);
    if (!saved.ok) return saved;
  }
  return ok(undefined);
}
