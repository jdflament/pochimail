import { StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import type { OutboxEntry } from "@pochimail/pipeline/outbox";
import type { ActionLog } from "../domain/action.ts";
import { inverseOf } from "../domain/action.ts";
import type { MailProvider, MailProviderCapabilities } from "../ports/mail-provider.ts";
import type { ReadRepositories, WriteRepositories } from "../ports/repositories.ts";
import type { Transaction, UnitOfWork } from "../ports/unit-of-work.ts";
import { type ActionHarness, describeActionUseCases } from "./action-contract.ts";

function memoryHarness(capabilities: MailProviderCapabilities): ActionHarness {
  let logs: ActionLog[] = [];
  let outbox: OutboxEntry[] = [];
  const archived = new Set<string>();
  const failing = new Set<string>();
  let mutations = 0;

  const actionLog = {
    append: async (entry: ActionLog) => (logs.push(entry), ok(undefined)),
    get: async () => err(new StorageError()),
    listForAction: async (_ws: unknown, id: string) => ok(logs.filter((e) => e.actionId === id)),
    listForKey: async (_ws: unknown, key: string) =>
      ok(logs.filter((e) => e.idempotencyKey === key)),
    listForBatch: async (_ws: unknown, id: string) => ok(logs.filter((e) => e.batchId === id)),
    list: async () => ok({ items: logs, nextCursor: null }),
  };
  const reads = { actionLog } as unknown as ReadRepositories;
  const uow: UnitOfWork = {
    reads,
    async run(work) {
      const saved = { logs: [...logs], outbox: [...outbox] };
      const tx = {
        repositories: { actionLog } as unknown as WriteRepositories,
        outbox: { append: async (e: OutboxEntry) => (outbox.push(e), ok(undefined)) },
      } satisfies Transaction;
      const result = await work(tx);
      if (!result.ok) ({ logs, outbox } = saved);
      return result;
    },
  };

  const provider: MailProvider = {
    capabilities,
    sync: async () => err(new StorageError()) as never,
    fetchBody: async () => ok(""),
    async applyCommands(commands) {
      const applied = [];
      for (const command of commands) {
        const ids = command.messageIds.map(String);
        if (ids.some((id) => failing.has(id)))
          return err(new (await import("../errors.ts")).Offline());
        for (const id of ids) {
          if (command.kind === "archive") archived.add(id);
          if (command.kind === "unarchive") archived.delete(id);
        }
        mutations++;
        applied.push({ command, inverse: inverseOf(command) });
      }
      return ok(applied);
    },
  };

  return {
    uow,
    provider,
    clock: { now: () => new Date("2026-11-17T10:00:00.000Z") },
    ids: (() => {
      let n = 0;
      return { next: (prefix) => `${prefix}_${++n}` };
    })(),
    isArchived: async (id) => archived.has(id),
    mutations: () => mutations,
    failFor: (ids) => {
      for (const id of ids) failing.add(id);
    },
  };
}

const base = {
  organization: "labels",
  archive: "remove-inbox-label",
  deltaSync: true,
  pushWakeups: false,
  unsubscribeSend: true,
} as const;

describeActionUseCases("one command per call", () => memoryHarness({ ...base, batchModify: null }));
describeActionUseCases("batch modify, folders", () =>
  memoryHarness({
    ...base,
    organization: "folders",
    archive: "move-to-archive-folder",
    batchModify: { maxCommands: 50 },
  }),
);
