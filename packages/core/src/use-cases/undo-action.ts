import type { Clock } from "../clock.ts";
import type { ActionLog } from "../domain/action.ts";
import { Cancelled, type DomainError, type StorageError } from "../errors.ts";
import { type ActionId, ActionLogId as makeLogId, type WorkspaceId } from "../ids.ts";
import type { AsyncResult, CancelSignal } from "../ports/common.ts";
import type { IdGenerator } from "../ports/id-generator.ts";
import type { MailProvider } from "../ports/mail-provider.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
import { unwrap } from "../result.ts";
import { recordEntry } from "./record-entry.ts";

export interface UndoActionDeps {
  readonly uow: UnitOfWork;
  readonly provider: MailProvider;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type UndoTarget =
  | { readonly workspaceId: WorkspaceId; readonly actionId: ActionId }
  | { readonly workspaceId: WorkspaceId; readonly batchId: string };

export type UndoOutcome =
  | { readonly status: "undone"; readonly actionId: ActionId }
  | { readonly status: "already-undone"; readonly actionId: ActionId }
  /** Unsubscribe: the log says so, and nothing is sent. */
  | { readonly status: "irreversible"; readonly actionId: ActionId }
  /** Only failed or refused entries: nothing was changed, so there is nothing to reverse. */
  | { readonly status: "not-applied"; readonly actionId: ActionId }
  | { readonly status: "failed"; readonly actionId: ActionId; readonly error: DomainError };

export interface UndoReport {
  readonly outcomes: readonly UndoOutcome[];
  readonly cancelled: boolean;
}

/**
 * Reverses applied actions using the inverse stored in the ActionLog, never state held in memory,
 * so it works from a fresh instance after a restart. A batch is undone newest-first. Entries
 * the provider fails to reverse stay `applied` (so undo can be retried) and the rest continue.
 */
export class UndoAction {
  constructor(private readonly deps: UndoActionDeps) {}

  async execute(target: UndoTarget, signal: CancelSignal): AsyncResult<UndoReport, StorageError> {
    const { uow, provider, clock, ids } = this.deps;
    const ws = target.workspaceId;
    const logs =
      "actionId" in target
        ? await uow.reads.actionLog.listForAction(ws, target.actionId)
        : await uow.reads.actionLog.listForBatch(ws, target.batchId);
    if (!logs.ok) return logs;

    const byAction = new Map<ActionId, ActionLog[]>();
    for (const entry of logs.value) {
      byAction.set(entry.actionId, [...(byAction.get(entry.actionId) ?? []), entry]);
    }

    const outcomes: UndoOutcome[] = [];
    for (const [actionId, entries] of [...byAction].reverse()) {
      const applied = entries.findLast((e) => e.outcome === "applied");
      if (!applied) {
        outcomes.push({ status: "not-applied", actionId });
        continue;
      }
      if (entries.some((e) => e.outcome === "undone")) {
        outcomes.push({ status: "already-undone", actionId });
        continue;
      }
      if (applied.irreversible || applied.inverse === null) {
        outcomes.push({ status: "irreversible", actionId });
        continue;
      }
      if (signal.aborted) return { ok: true, value: { outcomes, cancelled: true } };

      const result = await provider.applyCommands([applied.inverse], signal);
      const base = {
        schemaVersion: 1 as const,
        id: unwrap(makeLogId(ids.next("log"))),
        workspaceId: ws,
        actionId,
        idempotencyKey: applied.idempotencyKey,
        ...(applied.batchId === undefined ? {} : { batchId: applied.batchId }),
        at: clock.now().toISOString(),
      };
      if (!result.ok) {
        if (result.error instanceof Cancelled)
          return { ok: true, value: { outcomes, cancelled: true } };
        const entry: ActionLog = {
          ...base,
          outcome: "failed",
          command: applied.inverse,
          inverse: null,
          irreversible: false,
          errorCode: result.error.code,
        };
        await recordEntry(uow, entry, "ActionFailed", result.error.code);
        outcomes.push({ status: "failed", actionId, error: result.error });
        continue;
      }
      const reversed = result.value[0];
      const entry: ActionLog = {
        ...base,
        outcome: "undone",
        command: reversed?.command ?? applied.inverse,
        // Redo stays possible: the inverse of the undo is the original command.
        inverse: applied.command,
        irreversible: false,
      };
      const saved = await recordEntry(uow, entry, "ActionUndone");
      outcomes.push(
        saved.ok
          ? { status: "undone", actionId }
          : { status: "failed", actionId, error: saved.error },
      );
    }
    return { ok: true, value: { outcomes, cancelled: false } };
  }
}
