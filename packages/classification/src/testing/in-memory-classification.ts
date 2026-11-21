import { Cancelled, NotFound } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import { err, ok } from "@pochimail/kernel/result";
import { CATEGORIES } from "../model/category.ts";
import type { DerivedMessage } from "../model/derived.ts";
import type { ClassifiableMessage } from "../model/message-facts.ts";
import type { StoredSignal } from "../model/signal.ts";
import type { Topic } from "../model/topic.ts";
import type { ClassificationUnitOfWork } from "../ports/unit-of-work.ts";
import { makeDerived, makeMessage, OWNER_ADDRESS, type Seeder, WS_A } from "./samples.ts";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const byText = (a: string, b: string) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};

interface Data {
  messages: Map<string, ClassifiableMessage & { category: string }>;
  derived: Map<string, DerivedMessage>;
  signals: Map<string, StoredSignal>;
  topics: Map<string, Topic>;
  senders: Map<string, { vip: boolean; repliedCount: number }>;
}
const empty = (): Data => ({
  messages: new Map(),
  derived: new Map(),
  signals: new Map(),
  topics: new Map(),
  senders: new Map(),
});
const clone = (d: Data): Data => ({
  messages: new Map(d.messages),
  derived: new Map(d.derived),
  signals: new Map(d.signals),
  topics: new Map(d.topics),
  senders: new Map(d.senders),
});

export interface InMemoryClassification extends Seeder {
  readonly uow: ClassificationUnitOfWork;
  /** Events committed so far, in order; a rolled-back transaction leaves none. */
  committedEvents(): readonly EventEnvelope[];
  /** Derived rows, signals and events committed so far, as plain data (for leak checks). */
  snapshot(): Promise<{
    derived: unknown[];
    signals: unknown[];
    outbox: { event: EventEnvelope }[];
  }>;
}

/** The domain's rows and events in memory, with commit-or-roll-back like the real unit of work. */
export function createInMemoryClassification(): InMemoryClassification {
  let committed = empty();
  let events: EventEnvelope[] = [];

  const reads = (data: () => Data): ClassificationUnitOfWork["reads"] => ({
    derived: {
      get: async (ws, id) => {
        const d = data().derived.get(`${ws}/${id}`);
        return d ? ok(copy(d)) : err(new NotFound("Derived data"));
      },
      list: async (ws, accountId, page) => {
        const rows = [...data().derived.values()]
          .filter((d) => d.workspaceId === ws && d.accountId === accountId)
          .sort((a, b) => byText(a.messageId, b.messageId));
        const start = page.cursor === undefined ? 0 : Number(page.cursor);
        const items = rows.slice(start, start + page.limit).map(copy);
        const end = start + items.length;
        return ok({ items, nextCursor: end < rows.length ? String(end) : null });
      },
    },
    signals: {
      listForMessages: async (ws, ids) => {
        const wanted = new Set<string>(ids);
        return ok(
          [...data().signals.values()]
            .filter((s) => s.workspaceId === ws && wanted.has(s.messageId))
            .sort((a, b) => byText(a.messageId, b.messageId) || byText(a.kind, b.kind))
            .map(copy),
        );
      },
    },
    topics: {
      get: async (ws, id) => {
        const t = data().topics.get(`${ws}/${id}`);
        return t ? ok(copy(t)) : err(new NotFound("Topic"));
      },
      list: async (ws) =>
        ok([...data().topics.values()].filter((t) => t.workspaceId === ws).map(copy)),
    },
    messages: {
      get: async (ws, id) => {
        const m = data().messages.get(`${ws}/${id}`);
        if (!m) return err(new NotFound("Message"));
        const { category: _category, ...message } = m;
        return ok(copy(message));
      },
      countByCategory: async (ws, accountIds) => {
        const counts: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
        for (const [key, m] of data().messages)
          if (key.startsWith(`${ws}/`) && accountIds.includes(m.accountId))
            counts[m.category] = (counts[m.category] ?? 0) + 1;
        return ok(counts);
      },
    },
    signalFacts: {
      forMessages: async (ws, accountId, ids) => {
        const out = [];
        for (const id of [...ids].sort()) {
          const m = data().messages.get(`${ws}/${id}`);
          if (!m) return err(new NotFound("Message"));
          if (m.accountId !== accountId) continue;
          const sender = data().senders.get(m.from);
          out.push({
            messageId: id,
            from: m.from,
            subject: m.subject,
            snippet: m.snippet,
            storedCategory: m.category,
            receivedAt: m.receivedAt,
            opened: m.opened,
            ownerAddress: OWNER_ADDRESS,
            lastInThread: true,
            senderVip: sender?.vip ?? false,
            senderRepliedCount: sender?.repliedCount ?? 0,
          });
        }
        return ok(out);
      },
    },
  });

  const uow: ClassificationUnitOfWork = {
    reads: reads(() => committed),
    run: async (work, signal) => {
      if (signal?.aborted) return err(new Cancelled());
      const draft = clone(committed);
      const pending: EventEnvelope[] = [];
      const r = reads(() => draft);
      const result = await work({
        repositories: {
          derived: {
            ...r.derived,
            save: async (d) => {
              draft.derived.set(`${d.workspaceId}/${d.messageId}`, copy(d));
              return ok(undefined);
            },
          },
          signals: {
            ...r.signals,
            replaceForMessages: async (ws, ids, signals) => {
              const scope = new Set<string>(ids);
              for (const [k, s] of draft.signals)
                if (s.workspaceId === ws && scope.has(s.messageId)) draft.signals.delete(k);
              for (const s of signals)
                draft.signals.set(`${s.workspaceId}/${s.messageId}/${s.kind}`, copy(s));
              return ok(undefined);
            },
          },
          topics: {
            ...r.topics,
            save: async (t) => {
              draft.topics.set(`${t.workspaceId}/${t.id}`, copy(t));
              return ok(undefined);
            },
          },
          messages: {
            setCategory: async (ws, id, category) => {
              const m = draft.messages.get(`${ws}/${id}`);
              if (!m) return err(new NotFound("Message"));
              draft.messages.set(`${ws}/${id}`, { ...m, category });
              return ok(undefined);
            },
          },
        },
        events: {
          append: async (batch) => {
            pending.push(...copy(batch));
            return ok(undefined);
          },
        },
      });
      if (signal?.aborted) return err(new Cancelled());
      if (result.ok) {
        committed = draft;
        events = [...events, ...pending];
      }
      return result;
    },
  };

  return {
    uow,
    committedEvents: () => events.map(copy),
    snapshot: async () => ({
      derived: copy([...committed.derived.values()]),
      signals: copy([...committed.signals.values()]),
      outbox: events.map((event) => ({ event: copy(event) })),
    }),
    seed: async (rows) => {
      for (const [key, row] of Object.entries(rows)) {
        const n = Number(key);
        const message = makeMessage(n, row.message);
        const category = row.category ?? "notifications";
        committed.messages.set(`${WS_A}/${message.id}`, { ...message, category });
        committed.derived.set(
          `${WS_A}/${message.id}`,
          makeDerived(n, { category, snippet: message.snippet, ...row.derived }),
        );
      }
    },
    setSender: async (address, stats) => {
      committed.senders.set(address, {
        vip: stats.vip ?? false,
        repliedCount: stats.repliedCount ?? 0,
      });
    },
  };
}
