import type { ActionId, MessageId, TopicId } from "@pochimail/core/ids";
import type { Page } from "@pochimail/core/ports/common";
import { ok, unwrap } from "@pochimail/core/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import {
  ACCOUNT_1,
  makeAccount,
  makeActionLog,
  makeIncomingMessage,
  makeSender,
  makeSuggestion,
  makeThread,
  makeTopic,
  WS_A,
  WS_B,
} from "./fixtures.ts";
import type { UnitOfWorkHarness } from "./unit-of-work-contract.ts";

type H = UnitOfWorkHarness;

/** Writes through a committed transaction, the only way rows get in. */
async function write(
  h: H,
  work: (tx: Parameters<Parameters<H["uow"]["run"]>[0]>[0]) => Promise<unknown>,
) {
  const r = await h.uow.run(async (tx) => {
    await work(tx);
    return ok(undefined);
  });
  expect(r.ok).toBe(true);
}

async function drain<T>(
  next: (cursor?: string) => Promise<{ ok: true; value: Page<T> } | { ok: false }>,
) {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 100; guard++) {
    const r = await next(cursor);
    if (!r.ok) throw new Error("page failed");
    items.push(...r.value.items);
    if (r.value.nextCursor === null) return items;
    cursor = r.value.nextCursor;
  }
  throw new Error("cursor never ended");
}

export const repositoriesChecks: readonly Check<H>[] = [
  check("never returns another workspace's row (guards cross-workspace leaks)", async (h) => {
    await write(h, (tx) => tx.repositories.topics.save(makeTopic()));
    const other = await h.uow.reads.topics.get(WS_B, makeTopic().id);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error.code).toBe("storage.not_found");
    expect(await h.uow.reads.topics.list(WS_B)).toEqual(ok([]));
  }),
  check(
    "save replaces the row with the same id (guards duplicate rows after an update)",
    async (h) => {
      await write(h, (tx) => tx.repositories.accounts.save(makeAccount()));
      await write(h, (tx) =>
        tx.repositories.accounts.save(makeAccount({ address: "new@example.com" })),
      );
      const list = unwrap(await h.uow.reads.accounts.list(WS_A));
      expect(list.map((a) => a.address)).toEqual(["new@example.com"]);
    },
  ),
  check(
    "stores a copy, not the caller's object (guards later mutation corrupting stored data)",
    async (h) => {
      const topic = makeTopic();
      await write(h, (tx) => tx.repositories.topics.save(topic));
      (topic as { name: string }).name = "mutated after save";
      const stored = unwrap(await h.uow.reads.topics.get(WS_A, makeTopic().id));
      expect(stored.name).toBe("Trips");
      (stored as { name: string }).name = "mutated after read";
      expect(unwrap(await h.uow.reads.topics.get(WS_A, makeTopic().id)).name).toBe("Trips");
    },
  ),
  check(
    "round-trips threads, senders and suggestions (guards a repository dropping a field)",
    async (h) => {
      const thread = makeThread();
      const sender = makeSender();
      const suggestion = makeSuggestion();
      await write(h, async (tx) => {
        await tx.repositories.threads.upsert(thread);
        await tx.repositories.senders.upsert(sender);
        await tx.repositories.suggestions.save(suggestion);
      });
      expect(await h.uow.reads.threads.get(WS_A, thread.id)).toEqual(ok(thread));
      expect(await h.uow.reads.senders.get(WS_A, ACCOUNT_1, sender.address)).toEqual(ok(sender));
      expect(await h.uow.reads.suggestions.get(WS_A, suggestion.id)).toEqual(ok(suggestion));
    },
  ),
  check(
    "upsertMany twice leaves one row per message (guards a re-sync duplicating mail)",
    async (h) => {
      const batch = [makeIncomingMessage(1), makeIncomingMessage(2)];
      await write(h, (tx) => tx.repositories.messages.upsertMany(batch));
      await write(h, (tx) => tx.repositories.messages.upsertMany(batch));
      const all = await drain((cursor) =>
        h.uow.reads.messages.query(WS_A, {
          accountId: ACCOUNT_1,
          limit: 10,
          ...(cursor ? { cursor } : {}),
        }),
      );
      expect(all).toHaveLength(2);
    },
  ),
  check(
    "a re-sync keeps the category the user or classifier set (guards re-sync resetting categories)",
    async (h) => {
      const m = makeIncomingMessage(1);
      await write(h, (tx) => tx.repositories.messages.upsertMany([m]));
      await write(h, (tx) => tx.repositories.messages.setCategory(WS_A, m.id, "newsletters"));
      await write(h, (tx) => tx.repositories.messages.upsertMany([{ ...m, opened: true }]));
      const stored = unwrap(await h.uow.reads.messages.get(WS_A, m.id));
      expect(stored.category).toBe("newsletters");
      expect(stored.opened).toBe(true);
    },
  ),
  check(
    "setCategory on an unknown message is NotFound (guards silently ignoring a bad id)",
    async (h) => {
      await write(h, async (tx) => {
        const r = await tx.repositories.messages.setCategory(WS_A, "nope" as MessageId, "people");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("storage.not_found");
      });
    },
  ),
  check(
    "query filters by category and sender, newest first (guards wrong or unordered review lists)",
    async (h) => {
      const batch = [
        makeIncomingMessage(1, { from: "a@example.com" }),
        makeIncomingMessage(2, { from: "b@example.com" }),
        makeIncomingMessage(3, { from: "a@example.com" }),
      ];
      await write(h, async (tx) => {
        await tx.repositories.messages.upsertMany(batch);
        await tx.repositories.messages.setCategory(WS_A, batch[0]?.id as MessageId, "promotions");
        await tx.repositories.messages.setCategory(WS_A, batch[1]?.id as MessageId, "promotions");
        await tx.repositories.messages.setCategory(WS_A, batch[2]?.id as MessageId, "people");
      });
      const base = { accountId: ACCOUNT_1, limit: 10 };
      const promos = unwrap(
        await h.uow.reads.messages.query(WS_A, { ...base, category: "promotions" }),
      );
      expect(promos.items.map((m) => m.id)).toEqual(["msg-2", "msg-1"]);
      const fromA = unwrap(
        await h.uow.reads.messages.query(WS_A, { ...base, senderAddress: "a@example.com" }),
      );
      expect(fromA.items.map((m) => m.id)).toEqual(["msg-3", "msg-1"]);
      expect(unwrap(await h.uow.reads.messages.query(WS_B, base)).items).toEqual([]);
    },
  ),
  check(
    "paging by cursor visits every row once (guards skipped or repeated rows between pages)",
    async (h) => {
      const batch = Array.from({ length: 7 }, (_, i) => makeIncomingMessage(i + 1));
      await write(h, (tx) => tx.repositories.messages.upsertMany(batch));
      const first = unwrap(
        await h.uow.reads.messages.query(WS_A, { accountId: ACCOUNT_1, limit: 3 }),
      );
      expect(first.items).toHaveLength(3);
      expect(first.nextCursor).not.toBeNull();
      const all = await drain((cursor) =>
        h.uow.reads.messages.query(WS_A, {
          accountId: ACCOUNT_1,
          limit: 3,
          ...(cursor ? { cursor } : {}),
        }),
      );
      expect(all.map((m) => m.id).sort()).toEqual(batch.map((m) => m.id).sort());
    },
  ),
  check(
    "listPending leaves out approved and dismissed suggestions (guards re-proposing decided items)",
    async (h) => {
      await write(h, async (tx) => {
        await tx.repositories.suggestions.save(makeSuggestion());
        await tx.repositories.suggestions.save(
          makeSuggestion({ id: "sug-2" as never, state: "approved" }),
        );
        await tx.repositories.suggestions.save(
          makeSuggestion({ id: "sug-3" as never, state: "dismissed" }),
        );
      });
      const page = unwrap(await h.uow.reads.suggestions.listPending(WS_A, { limit: 10 }));
      expect(page.items.map((s) => s.id)).toEqual(["sug-1"]);
    },
  ),
  check(
    "the action log is append-only (guards an entry being rewritten, which would break undo)",
    async (h) => {
      const original = makeActionLog(1);
      await write(h, (tx) => tx.repositories.actionLog.append(original));
      await write(h, async (tx) => {
        await tx.repositories.actionLog.append({ ...original, outcome: "undone" });
      });
      expect(unwrap(await h.uow.reads.actionLog.get(WS_A, original.id)).outcome).toBe("applied");
    },
  ),
  check(
    "lists log entries for one action, oldest first (guards undo reading another action's entries)",
    async (h) => {
      await write(h, async (tx) => {
        await tx.repositories.actionLog.append(makeActionLog(1));
        await tx.repositories.actionLog.append(makeActionLog(2, { actionId: "act-2" as ActionId }));
        await tx.repositories.actionLog.append(makeActionLog(3, { outcome: "undone" }));
      });
      const entries = unwrap(await h.uow.reads.actionLog.listForAction(WS_A, "act-1" as ActionId));
      expect(entries.map((e) => e.id)).toEqual(["log-1", "log-3"]);
    },
  ),
  check(
    "sync cursors are per account and scope (guards one folder's cursor overwriting another's)",
    async (h) => {
      expect(await h.uow.reads.cursors.get(WS_A, ACCOUNT_1, "inbox")).toEqual(ok(null));
      await write(h, async (tx) => {
        await tx.repositories.cursors.set(WS_A, ACCOUNT_1, { scope: "inbox", token: "t1" });
        await tx.repositories.cursors.set(WS_A, ACCOUNT_1, { scope: "sent", token: "t2" });
      });
      expect(await h.uow.reads.cursors.get(WS_A, ACCOUNT_1, "inbox")).toEqual(
        ok({ scope: "inbox", token: "t1" }),
      );
      expect(await h.uow.reads.cursors.get(WS_B, ACCOUNT_1, "inbox")).toEqual(ok(null));
    },
  ),
  check("topics list returns every saved topic (guards a repository losing rows)", async (h) => {
    await write(h, async (tx) => {
      await tx.repositories.topics.save(makeTopic());
      await tx.repositories.topics.save(makeTopic({ id: "topic-2" as TopicId, name: "Taxes" }));
    });
    const names = unwrap(await h.uow.reads.topics.list(WS_A))
      .map((t) => t.name)
      .sort();
    expect(names).toEqual(["Taxes", "Trips"]);
  }),
];

/** Contract for the repositories behind any `UnitOfWork`. Reuse unchanged for SQLite in M2. */
export function repositoriesContract(make: () => H | Promise<H>): void {
  registerContract("Repositories contract", repositoriesChecks, make);
}
