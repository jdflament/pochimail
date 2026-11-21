import type { Clock } from "@pochimail/kernel/clock";
import type { AsyncResult, CancelSignal } from "@pochimail/kernel/common";
import { Cancelled, type DomainError, type StorageError } from "@pochimail/kernel/errors";
import type { IdGenerator } from "@pochimail/kernel/id-generator";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import type { ActionLog } from "../domain/action.ts";
import { type ActionId, ActionLogId as makeLogId } from "../ids.ts";
import type { MailProvider } from "../ports/mail-provider.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";
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
    const { uow } = this.deps;
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
      const outcome = await this.undoOne(actionId, entries, signal);
      if (outcome === "cancelled") return { ok: true, value: { outcomes, cancelled: true } };
      outcomes.push(outcome);
    }
    return { ok: true, value: { outcomes, cancelled: false } };
  }

  /**
   * Reverses every `applied` entry of one action, newest first (a partially applied action has
   * several). Entries already `undone` are skipped, so a retry continues where it stopped.
   */
  private async undoOne(
    actionId: ActionId,
    entries: readonly ActionLog[],
    signal: CancelSignal,
  ): Promise<UndoOutcome | "cancelled"> {
    const { uow, provider, clock, ids } = this.deps;
    const applied = entries.filter((e) => e.outcome === "applied");
    if (applied.length === 0) return { status: "not-applied", actionId };
    const done = entries.filter((e) => e.outcome === "undone").length;
    if (done >= applied.length) return { status: "already-undone", actionId };
    if (applied.some((e) => e.irreversible || e.inverse === null)) {
      return { status: "irreversible", actionId };
    }
    for (const entry of [...applied].reverse().slice(done)) {
      const inverse = entry.inverse;
      if (inverse === null) return { status: "irreversible", actionId };
      if (signal.aborted) return "cancelled";
      const result = await provider.applyCommands([inverse], signal);
      const base = {
        schemaVersion: 1 as const,
        id: unwrap(makeLogId(ids.next("log"))),
        workspaceId: entry.workspaceId,
        actionId,
        idempotencyKey: entry.idempotencyKey,
        ...(entry.batchId === undefined ? {} : { batchId: entry.batchId }),
        at: clock.now().toISOString(),
      };
      if (!result.ok) {
        if (result.error instanceof Cancelled) return "cancelled";
        const failure: ActionLog = {
          ...base,
          outcome: "failed",
          command: inverse,
          inverse: null,
          irreversible: false,
          errorCode: result.error.code,
        };
        await recordEntry(uow, failure, "ActionFailed", result.error.code);
        return { status: "failed", actionId, error: result.error };
      }
      const undone: ActionLog = {
        ...base,
        outcome: "undone",
        command: result.value[0]?.command ?? inverse,
        // Redo stays possible: the inverse of the undo is the original command.
        inverse: entry.command,
        irreversible: false,
      };
      const saved = await recordEntry(uow, undone, "ActionUndone");
      if (!saved.ok) return { status: "failed", actionId, error: saved.error };
    }
    return { status: "undone", actionId };
  }
}
