import type { IncomingMessage, SenderStats, Thread } from "@pochimail/core/domain/mail";
import { ThreadId } from "@pochimail/core/ids";
import { unwrap } from "@pochimail/kernel/result";
import { CORRESPONDENTS, VIP_COUNT } from "../fixture-mailbox/content.ts";
import type { createInMemoryUnitOfWork } from "../in-memory-store.ts";

const live = () => new AbortController().signal;
const VIP_ADDRESSES: ReadonlySet<string> = new Set(
  CORRESPONDENTS.slice(0, VIP_COUNT).map((c) => c.address),
);

/**
 * What sync does not provide yet: threads (from the thread ids the fixture stamps on each
 * message) and per-sender stats (the fixture's important senders are marked VIP).
 */
export async function seedContext(
  uow: ReturnType<typeof createInMemoryUnitOfWork>["uow"],
  messages: readonly IncomingMessage[],
  owner: string,
) {
  const byThread = new Map<string, IncomingMessage[]>();
  const bySender = new Map<string, IncomingMessage[]>();
  for (const m of messages) {
    byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
    if (m.from.toLowerCase() !== owner.toLowerCase())
      bySender.set(m.from, [...(bySender.get(m.from) ?? []), m]);
  }
  const newest = (list: readonly IncomingMessage[]) =>
    list
      .map((m) => m.receivedAt)
      .sort()
      .at(-1) ?? "";
  const first = messages[0];
  if (!first) return;
  const threads: Thread[] = [...byThread.entries()].map(([id, list]) => {
    const ordered = [...list].sort(
      (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id),
    );
    return {
      schemaVersion: 1,
      id: unwrap(ThreadId(id)),
      workspaceId: first.workspaceId,
      accountId: first.accountId,
      subject: ordered[0]?.subject ?? "",
      messageIds: ordered.map((m) => m.id),
      lastMessageAt: newest(ordered),
    };
  });
  const senders: SenderStats[] = [...bySender.entries()].map(([address, list]) => ({
    schemaVersion: 1,
    workspaceId: first.workspaceId,
    accountId: first.accountId,
    address,
    messageCount: list.length,
    openedCount: list.filter((m) => m.opened).length,
    repliedCount: 0,
    lastMessageAt: newest(list),
    vip: VIP_ADDRESSES.has(address),
  }));
  unwrap(
    await uow.run(async (tx) => {
      for (const t of threads) unwrap(await tx.repositories.threads.upsert(t));
      for (const s of senders) unwrap(await tx.repositories.senders.upsert(s));
      return { ok: true as const, value: undefined };
    }, live()),
  );
}
