import { describe, expect, it } from "vitest";
import type { Clock } from "../clock.ts";
import type { Action, Command } from "../domain/action.ts";
import { ActionId, MessageId, WorkspaceId } from "../ids.ts";
import type { CancelSignal } from "../ports/common.ts";
import type { IdGenerator } from "../ports/id-generator.ts";
import type { MailProvider } from "../ports/mail-provider.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { unwrap } from "../result.ts";
import { ApplyAction, type ApplyActionItem } from "./apply-action.ts";
import { UndoAction } from "./undo-action.ts";

/**
 * What the suite needs from a mailbox + storage pair. Adapters (SQLite, real providers against
 * fixtures) implement it and run `describeActionUseCases` unchanged.
 */
export interface ActionHarness {
  readonly uow: UnitOfWork;
  readonly provider: MailProvider;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Mailbox state as the provider sees it. */
  isArchived(messageId: string): Promise<boolean>;
  /** Number of mutations the provider actually performed (replays must not add any). */
  mutations(): number;
  /** Makes the provider fail for every command touching one of these messages. */
  failFor(messageIds: readonly string[]): void;
}

const signal: CancelSignal = {
  aborted: false,
  addEventListener() {},
  removeEventListener() {},
};
const ws = unwrap(WorkspaceId("wsp_1"));
const confirmed: ApplyActionItem["authorization"] = {
  autonomy: "suggest",
  categories: ["newsletters"],
  confidence: 0.95,
  userConfirmed: true,
};

function item(
  n: number,
  kind: Command["kind"],
  authorization: ApplyActionItem["authorization"] = confirmed,
  key = `key-${n}`,
): ApplyActionItem {
  const action: Action = {
    schemaVersion: 1,
    id: unwrap(ActionId(`act_${n}`)),
    workspaceId: ws,
    idempotencyKey: key,
    command: { kind, messageIds: [unwrap(MessageId(`m${n}`))] },
    createdAt: "2026-11-17T10:00:00.000Z",
  };
  return { action, authorization };
}

export function describeActionUseCases(name: string, create: () => ActionHarness): void {
  describe(`action use cases: ${name}`, () => {
    const usecases = (h: ActionHarness) => ({
      apply: new ApplyAction(h),
      undo: new UndoAction(h),
    });

    it("applying the same idempotency key twice mutates the provider once", async () => {
      const h = create();
      const first = await usecases(h).apply.execute({ items: [item(1, "archive")] }, signal);
      // A fresh instance (as after a restart) must still see the key in the log.
      const again = await usecases(h).apply.execute({ items: [item(1, "archive")] }, signal);
      expect(first.outcomes[0]?.status).toBe("applied");
      expect(again.outcomes[0]?.status).toBe("already-applied");
      expect(h.mutations()).toBe(1);
    });

    it("undo from a fresh use case instance restores the prior state", async () => {
      const h = create();
      await usecases(h).apply.execute({ batchId: "b1", items: [item(1, "archive")] }, signal);
      expect(await h.isArchived("m1")).toBe(true);
      const report = unwrap(
        await usecases(h).undo.execute(
          { workspaceId: ws, actionId: unwrap(ActionId("act_1")) },
          signal,
        ),
      );
      expect(report.outcomes[0]?.status).toBe("undone");
      expect(await h.isArchived("m1")).toBe(false);
    });

    it("a provider failure mid-batch is logged as failed and undo reverses only applied actions", async () => {
      const h = create();
      h.failFor(["m2"]);
      const { apply, undo } = usecases(h);
      const report = await apply.execute(
        { batchId: "b1", items: [item(1, "archive"), item(2, "archive"), item(3, "archive")] },
        signal,
      );
      expect(report.outcomes.map((o) => o.status)).toEqual(["applied", "failed", "applied"]);
      const logged = unwrap(await h.uow.reads.actionLog.listForBatch(ws, "b1"));
      expect(logged.map((e) => e.outcome)).toEqual(["applied", "failed", "applied"]);

      const before = h.mutations();
      const undone = unwrap(await undo.execute({ workspaceId: ws, batchId: "b1" }, signal));
      expect(undone.outcomes.map((o) => o.status).sort()).toEqual([
        "not-applied",
        "undone",
        "undone",
      ]);
      expect(h.mutations() - before).toBe(2);
      expect(await h.isArchived("m1")).toBe(false);
      expect(await h.isArchived("m3")).toBe(false);
    });

    it("an unauthorized action never reaches the provider and is logged as refused", async () => {
      const h = create();
      const readOnly = { ...confirmed, autonomy: "just-look" as const };
      const report = await usecases(h).apply.execute(
        { items: [item(1, "archive", readOnly)] },
        signal,
      );
      expect(report.outcomes[0]).toMatchObject({ status: "refused", reason: "read-only" });
      expect(h.mutations()).toBe(0);
      const logged = unwrap(await h.uow.reads.actionLog.listForKey(ws, "key-1"));
      expect(logged).toMatchObject([{ outcome: "refused", denialReason: "read-only" }]);
    });

    it("an unsubscribe is logged irreversible and undo does not send anything", async () => {
      const h = create();
      await usecases(h).apply.execute({ items: [item(1, "unsubscribe")] }, signal);
      const before = h.mutations();
      const report = unwrap(
        await usecases(h).undo.execute(
          { workspaceId: ws, actionId: unwrap(ActionId("act_1")) },
          signal,
        ),
      );
      expect(report.outcomes[0]?.status).toBe("irreversible");
      expect(h.mutations()).toBe(before);
    });
  });
}
