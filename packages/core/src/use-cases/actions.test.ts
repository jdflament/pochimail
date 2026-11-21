import { Offline, StorageError } from "@pochimail/kernel/errors";
import { MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import type { OutboxEntry } from "@pochimail/pipeline/outbox";
import { eventSinkOver } from "@pochimail/pipeline/outbox-event-sink";
import { expect, it } from "vitest";
import type { ActionLog } from "../domain/action.ts";
import { inverseOf } from "../domain/action.ts";
import { ActionId } from "../ids.ts";
import {
  type MailProvider,
  type MailProviderCapabilities,
  PartiallyApplied,
} from "../ports/mail-provider.ts";
import type { ReadRepositories, WriteRepositories } from "../ports/repositories.ts";
import type { Transaction, UnitOfWork } from "../ports/unit-of-work.ts";
import { type ActionHarness, describeActionUseCases } from "./action-contract.ts";
import { ApplyAction } from "./apply-action.ts";
import { UndoAction } from "./undo-action.ts";

function memoryHarness(
  capabilities: MailProviderCapabilities,
): ActionHarness & { failPartlyAt(id: string): void } {
  let logs: ActionLog[] = [];
  let outbox: OutboxEntry[] = [];
  const archived = new Set<string>();
  const failing = new Set<string>();
  let partlyAt: string | null = null;
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
      const writer = { append: async (e: OutboxEntry) => (outbox.push(e), ok(undefined)) };
      const tx = {
        repositories: { actionLog } as unknown as WriteRepositories,
        outbox: writer,
        events: eventSinkOver(writer),
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
        if (partlyAt !== null && ids.includes(partlyAt)) {
          // Applies the ids before the failing one, then fails part-way.
          const done = command.messageIds.slice(0, ids.indexOf(partlyAt));
          for (const id of done) archived.add(String(id));
          mutations++;
          return err(
            new PartiallyApplied(
              new Offline(),
              done.length === 0
                ? []
                : [
                    {
                      command: { ...command, messageIds: done },
                      inverse: inverseOf({ ...command, messageIds: done }),
                    },
                  ],
            ),
          );
        }
        if (ids.some((id) => failing.has(id)))
          return err(new (await import("@pochimail/kernel/errors")).Offline());
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
    failPartlyAt: (id) => {
      partlyAt = id;
    },
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

// Guards: a half-applied action whose applied part cannot be undone, or an undo that touches the rest.
it("a provider failing part-way logs the applied part as applied and undo restores exactly that part", async () => {
  const h = memoryHarness({ ...base, batchModify: { maxCommands: 50 } });
  const ws = unwrap(WorkspaceId("wsp_1"));
  const ids = [1, 2, 3].map((n) => unwrap(MessageId(`m${n}`)));
  h.failPartlyAt("m3");
  const apply = new ApplyAction(h);
  const report = await apply.execute(
    {
      items: [
        {
          action: {
            schemaVersion: 1,
            id: unwrap(ActionId("act_1")),
            workspaceId: ws,
            idempotencyKey: "k1",
            command: { kind: "archive", messageIds: ids },
            createdAt: "2026-11-17T10:00:00.000Z",
          },
          authorization: {
            autonomy: "suggest",
            categories: ["newsletters"],
            confidence: 0.95,
            userConfirmed: true,
          },
        },
      ],
    },
    { aborted: false, addEventListener() {}, removeEventListener() {} },
  );
  expect(report.outcomes[0]?.status).toBe("failed");
  expect(await h.isArchived("m1")).toBe(true);
  expect(await h.isArchived("m2")).toBe(true);
  expect(await h.isArchived("m3")).toBe(false);
  const logged = unwrap(await h.uow.reads.actionLog.listForAction(ws, unwrap(ActionId("act_1"))));
  expect(logged.map((e) => e.outcome)).toEqual(["applied", "failed"]);
  expect(logged[0]?.command.messageIds).toEqual(ids.slice(0, 2));
  expect(logged[0]?.inverse).toEqual({ kind: "unarchive", messageIds: ids.slice(0, 2) });

  const undo = new UndoAction(h);
  const undone = unwrap(
    await undo.execute(
      { workspaceId: ws, actionId: unwrap(ActionId("act_1")) },
      { aborted: false, addEventListener() {}, removeEventListener() {} },
    ),
  );
  expect(undone.outcomes[0]?.status).toBe("undone");
  expect(await h.isArchived("m1")).toBe(false);
  expect(await h.isArchived("m2")).toBe(false);
  expect(await h.isArchived("m3")).toBe(false);
});
