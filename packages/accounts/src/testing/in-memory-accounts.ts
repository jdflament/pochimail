import { NotFound, StorageError } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import { err, ok } from "@pochimail/kernel/result";
import type { Account } from "../model/account.ts";
import type { AccountsUnitOfWork } from "../ports/unit-of-work.ts";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface InMemoryAccounts {
  readonly uow: AccountsUnitOfWork;
  /** Events committed so far, in order; a rolled-back transaction leaves none. */
  committedEvents(): readonly EventEnvelope[];
}

/** Accounts and their events in memory, with the commit-or-roll-back behaviour of the real unit of work. */
export function createInMemoryAccounts(): InMemoryAccounts {
  const key = (ws: string, id: string) => `${ws}/${id}`;
  let accounts = new Map<string, Account>();
  let events: EventEnvelope[] = [];

  const readerOver = (data: () => Map<string, Account>) => ({
    get: async (ws: string, id: string) => {
      const found = data().get(key(ws, id));
      return found ? ok(copy(found)) : err(new NotFound("Account"));
    },
    list: async (ws: string) =>
      ok(
        [...data().values()]
          .filter((a) => a.workspaceId === ws)
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((a) => copy(a)),
      ),
  });

  const uow: AccountsUnitOfWork = {
    reads: { accounts: readerOver(() => accounts) },
    async run(work, signal) {
      const draft = new Map(accounts);
      const drafted: EventEnvelope[] = [];
      let outcome: Awaited<ReturnType<typeof work>>;
      try {
        outcome = await work({
          repositories: {
            accounts: {
              ...readerOver(() => draft),
              save: async (a) => {
                draft.set(key(a.workspaceId, a.id), copy(a));
                return ok(undefined);
              },
              remove: async (ws, id) => {
                draft.delete(key(ws, id));
                return ok(undefined);
              },
            },
          },
          events: {
            append: async (e) => {
              drafted.push(...copy(e));
              return ok(undefined);
            },
          },
        });
      } catch (cause) {
        return err(new StorageError("Transaction failed", { cause }));
      }
      if (!outcome.ok || signal?.aborted) return outcome;
      accounts = draft;
      events = [...events, ...drafted];
      return outcome;
    },
  };
  return { uow, committedEvents: () => events };
}
