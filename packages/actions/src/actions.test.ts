import { Offline } from "@pochimail/kernel/errors";
import { MessageId, WorkspaceId } from "@pochimail/kernel/ids";
import { err, ok, unwrap } from "@pochimail/kernel/result";
import { expect, it } from "vitest";
import { ActionId } from "./ids.ts";
import { inverseOf } from "./model/action.ts";
import { authorize } from "./policies/authorize.ts";
import {
  type MailCommands,
  type MailProviderCapabilities,
  PartiallyApplied,
} from "./ports/mail-commands.ts";
import { type ActionHarness, describeActionUseCases } from "./testing/action-contract.ts";
import { createInMemoryActions } from "./testing/in-memory-actions.ts";
import { authorizeContract } from "./testing/policy-contract.ts";
import { ApplyAction } from "./use-cases/apply-action.ts";
import { UndoAction } from "./use-cases/undo-action.ts";

function memoryHarness(
  capabilities: MailProviderCapabilities,
): ActionHarness & { failPartlyAt(id: string): void } {
  const { uow } = createInMemoryActions();
  const archived = new Set<string>();
  const failing = new Set<string>();
  let partlyAt: string | null = null;
  let mutations = 0;

  const provider: MailCommands = {
    capabilities,
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
        if (ids.some((id) => failing.has(id))) return err(new Offline());
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
            protectedCategories: ["people"],
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

authorizeContract(authorize, {
  categories: ["people", "promotions", "newsletters"],
  protectedCategories: ["people"],
});
