import type { Account } from "@pochimail/core/domain/account";
import type { ActionLog, Suggestion } from "@pochimail/core/domain/action";
import type { DerivedMessage } from "@pochimail/core/domain/derived";
import type { Message, SenderStats, Thread, Topic } from "@pochimail/core/domain/mail";
import { Cancelled, NotFound, StorageError } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import type { AsyncResult, CancelSignal, Page, PageRequest } from "@pochimail/core/ports/common";
import type { SyncCursor } from "@pochimail/core/ports/mail-provider";
import type { OutboxRecord, OutboxStore } from "@pochimail/core/ports/outbox";
import type { ReadRepositories, WriteRepositories } from "@pochimail/core/ports/repositories";
import type { OutboxEntry, Transaction, UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { err, ok, type Result } from "@pochimail/core/result";
import { createFaults, type Faults } from "./faults.ts";

interface Data {
  accounts: Map<string, Account>;
  messages: Map<string, Message>;
  threads: Map<string, Thread>;
  derived: Map<string, DerivedMessage>;
  senders: Map<string, SenderStats>;
  suggestions: Map<string, Suggestion>;
  actionLog: Map<string, ActionLog>;
  topics: Map<string, Topic>;
  cursors: Map<string, SyncCursor>;
  outbox: OutboxEntry[];
}

const emptyData = (): Data => ({
  accounts: new Map(),
  messages: new Map(),
  threads: new Map(),
  derived: new Map(),
  senders: new Map(),
  suggestions: new Map(),
  actionLog: new Map(),
  topics: new Map(),
  cursors: new Map(),
  outbox: [],
});

/** A message that arrives unclassified is filed here until the classifier says otherwise. */
const DEFAULT_CATEGORY = "notifications" as const;

const key = (...parts: string[]) => parts.join("\u0000");
const copy = <T>(value: T): T => structuredClone(value);

function paginate<T>(sorted: readonly T[], page: PageRequest): Page<T> {
  const start = page.cursor === undefined ? 0 : Number(page.cursor);
  const items = sorted.slice(start, start + page.limit).map(copy);
  const end = start + items.length;
  return { items, nextCursor: end < sorted.length ? String(end) : null };
}
const oldestFirst = (
  log: Map<string, ActionLog>,
  ws: WorkspaceId,
  match: (l: ActionLog) => boolean,
) =>
  [...log.values()]
    .filter((l) => l.workspaceId === ws && match(l))
    .sort((a, b) => byText(a.at, b.at) || byText(a.id, b.id))
    .map(copy);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface InMemoryUnitOfWork {
  readonly uow: UnitOfWork;
  /** Everything committed to the outbox so far, in order. */
  committedOutbox(): Promise<readonly OutboxEntry[]>;
  /** The relay's view of the committed outbox: undelivered rows, and marking them delivered. */
  readonly outboxStore: OutboxStore;
  /** Everything committed, every repository and the outbox, as plain data (for leak checks). */
  snapshot(): Promise<unknown>;
  /** Force repository and outbox calls to fail with a `StorageError`. */
  readonly faults: Faults<StorageError>;
}

/**
 * In-memory repositories plus a transactional UnitOfWork. A transaction works on a private copy;
 * commit swaps it in, rollback drops it. Transactions run one at a time.
 */
export function createInMemoryUnitOfWork(): InMemoryUnitOfWork {
  let committed = emptyData();
  const faults = createFaults<StorageError>();
  const fail = () => faults.take();

  /** Builds the repositories over whichever dataset `data()` currently names. */
  function readers(data: () => Data): ReadRepositories {
    const guarded = <T>(read: () => Result<T, StorageError | NotFound>) => {
      const failure = fail();
      return Promise.resolve(failure ? err(failure) : read());
    };
    const found = <T>(map: Map<string, T>, k: string, what: string) =>
      guarded(() => {
        const v = map.get(k);
        return v === undefined ? err(new NotFound(what)) : ok(copy(v));
      });
    return {
      accounts: {
        get: (ws, id) => found(data().accounts, key(ws, id), "Account"),
        list: (ws) =>
          guarded(() =>
            ok([...data().accounts.values()].filter((a) => a.workspaceId === ws).map(copy)),
          ) as never,
      },
      messages: {
        get: (ws, id) => found(data().messages, key(ws, id), "Message"),
        query: (ws, q) =>
          guarded(() => {
            const rows = [...data().messages.values()]
              .filter(
                (m) =>
                  m.workspaceId === ws &&
                  m.accountId === q.accountId &&
                  (q.category === undefined || m.category === q.category) &&
                  (q.senderAddress === undefined || m.from === q.senderAddress),
              )
              .sort((a, b) => byText(b.receivedAt, a.receivedAt) || byText(a.id, b.id));
            return ok(paginate(rows, q));
          }) as never,
      },
      threads: { get: (ws, id) => found(data().threads, key(ws, id), "Thread") },
      derived: {
        get: (ws, id) => found(data().derived, key(ws, id), "Derived data"),
        list: (ws, acc, page) =>
          guarded(() => {
            const rows = [...data().derived.values()]
              .filter((d) => d.workspaceId === ws && d.accountId === acc)
              .sort((a, b) => byText(a.messageId, b.messageId));
            return ok(paginate(rows, page));
          }) as never,
      },
      senders: {
        get: (ws, acc, address) => found(data().senders, key(ws, acc, address), "Sender"),
        list: (ws, acc, page) =>
          guarded(() => {
            const rows = [...data().senders.values()]
              .filter((s) => s.workspaceId === ws && s.accountId === acc)
              .sort((a, b) => byText(a.address, b.address));
            return ok(paginate(rows, page));
          }) as never,
      },
      suggestions: {
        get: (ws, id) => found(data().suggestions, key(ws, id), "Suggestion"),
        listPending: (ws, page) =>
          guarded(() => {
            const rows = [...data().suggestions.values()]
              .filter((s) => s.workspaceId === ws && s.state === "pending")
              .sort((a, b) => byText(a.createdAt, b.createdAt) || byText(a.id, b.id));
            return ok(paginate(rows, page));
          }) as never,
      },
      actionLog: {
        get: (ws, id) => found(data().actionLog, key(ws, id), "Action log entry"),
        listForAction: (ws, actionId) =>
          guarded(() =>
            ok(
              [...data().actionLog.values()]
                .filter((l) => l.workspaceId === ws && l.actionId === actionId)
                .map(copy),
            ),
          ) as never,
        listForKey: (ws, idempotencyKey) =>
          guarded(() =>
            ok(oldestFirst(data().actionLog, ws, (l) => l.idempotencyKey === idempotencyKey)),
          ) as never,
        listForBatch: (ws, batchId) =>
          guarded(() =>
            ok(oldestFirst(data().actionLog, ws, (l) => l.batchId === batchId)),
          ) as never,
        list: (ws, page) =>
          guarded(() => {
            const rows = [...data().actionLog.values()].filter((l) => l.workspaceId === ws);
            return ok(paginate(rows, page));
          }) as never,
      },
      topics: {
        get: (ws, id) => found(data().topics, key(ws, id), "Topic"),
        list: (ws) =>
          guarded(() =>
            ok([...data().topics.values()].filter((t) => t.workspaceId === ws).map(copy)),
          ) as never,
      },
      cursors: {
        get: (ws, acc, scope) =>
          guarded(() => {
            const c = data().cursors.get(key(ws, acc, scope));
            return ok(c === undefined ? null : copy(c));
          }) as never,
      },
    };
  }

  function writers(data: () => Data): WriteRepositories {
    const r = readers(data);
    const put = <T>(map: () => Map<string, T>, k: string, value: T) => {
      const failure = fail();
      if (failure) return Promise.resolve(err(failure));
      map().set(k, copy(value));
      return Promise.resolve(ok(undefined));
    };
    return {
      accounts: {
        ...r.accounts,
        save: (a) => put(() => data().accounts, key(a.workspaceId, a.id), a),
      },
      messages: {
        ...r.messages,
        upsertMany: async (messages) => {
          const failure = fail();
          if (failure) return err(failure);
          for (const m of messages) {
            const k = key(m.workspaceId, m.id);
            const existing = data().messages.get(k);
            // Re-running with the same input changes nothing; a known category survives.
            data().messages.set(
              k,
              copy({ ...m, category: existing?.category ?? DEFAULT_CATEGORY }),
            );
          }
          return ok(undefined);
        },
        setCategory: async (ws, id, category) => {
          const failure = fail();
          if (failure) return err(failure);
          const existing = data().messages.get(key(ws, id));
          if (!existing) return err(new NotFound("Message"));
          data().messages.set(key(ws, id), { ...existing, category });
          return ok(undefined);
        },
      },
      derived: {
        ...r.derived,
        save: (d) => put(() => data().derived, key(d.workspaceId, d.messageId), d),
      },
      threads: {
        ...r.threads,
        upsert: (t) => put(() => data().threads, key(t.workspaceId, t.id), t),
      },
      senders: {
        ...r.senders,
        upsert: (s) => put(() => data().senders, key(s.workspaceId, s.accountId, s.address), s),
      },
      suggestions: {
        ...r.suggestions,
        save: (s) => put(() => data().suggestions, key(s.workspaceId, s.id), s),
      },
      actionLog: {
        ...r.actionLog,
        append: async (entry) => {
          const failure = fail();
          if (failure) return err(failure);
          const k = key(entry.workspaceId, entry.id);
          // Append-only: an existing entry is never replaced.
          if (data().actionLog.has(k))
            return err(new StorageError("Action log entry already exists"));
          data().actionLog.set(k, copy(entry));
          return ok(undefined);
        },
      },
      topics: { ...r.topics, save: (t) => put(() => data().topics, key(t.workspaceId, t.id), t) },
      cursors: {
        ...r.cursors,
        set: (ws, acc, cursor) => put(() => data().cursors, key(ws, acc, cursor.scope), cursor),
      },
    };
  }

  // Committed outbox is append-only, so the index is a stable row id.
  const delivered = new Set<number>();
  const outboxStore: OutboxStore = {
    async pending(limit) {
      const rows: OutboxRecord[] = [];
      committed.outbox.forEach((entry, i) => {
        if (!delivered.has(i) && rows.length < limit)
          rows.push({ id: String(i), entry: copy(entry) });
      });
      return ok(rows);
    },
    async markDelivered(id) {
      const i = Number(id);
      if (!Number.isInteger(i) || i < 0 || i >= committed.outbox.length)
        return err(new StorageError("Outbox row not found"));
      delivered.add(i);
      return ok(undefined);
    },
  };

  let queue: Promise<unknown> = Promise.resolve();

  function run<T, E>(
    work: (tx: Transaction) => Promise<Result<T, E>>,
    signal?: CancelSignal,
  ): AsyncResult<T, E | StorageError | Cancelled> {
    const job = async (): Promise<Result<T, E | StorageError | Cancelled>> => {
      if (signal?.aborted) return err(new Cancelled());
      const draft = copy(committed);
      const result = await work({
        repositories: writers(() => draft),
        outbox: {
          append: async (entry) => {
            const failure = fail();
            if (failure) return err(failure);
            draft.outbox.push(copy(entry));
            return ok(undefined);
          },
        },
      });
      if (signal?.aborted) return err(new Cancelled());
      if (result.ok) committed = draft;
      return result;
    };
    // A throw rolls back by never swapping the draft in; the chain keeps going for the next run.
    const next = queue.then(job, job);
    queue = next.catch(() => undefined);
    return next;
  }

  return {
    uow: { reads: readers(() => committed), run },
    committedOutbox: async () => copy(committed.outbox),
    snapshot: async () =>
      copy(
        Object.fromEntries(
          Object.entries(committed).map(([name, rows]) => [
            name,
            rows instanceof Map ? [...rows.values()] : rows,
          ]),
        ),
      ),
    outboxStore,
    faults,
  };
}
