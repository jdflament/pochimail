/** A gate that runs zero tasks must not pass: a vacuous green hides a broken or unwired gate. */

export type GateName = "typecheck" | "lint" | "test" | "build" | "knip";

/**
 * Gates allowed to run zero tasks, each until the ticket that wires it lands. Empty now that every
 * gate has tasks (`build` landed with M0-09); add an entry only with a ticket to remove it.
 */
export const allowedEmpty: ReadonlySet<GateName> = new Set<GateName>();

export type GateResult = { gate: GateName; count: number; ok: boolean };

type DryRun = { tasks?: ReadonlyArray<{ taskId?: string; command?: string }> };

/** Counts tasks that really run a script in a `turbo run <gate> --dry=json` payload. */
export function countTasks(dryRunJson: string): number {
  const parsed: DryRun = JSON.parse(dryRunJson);
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("Not a turbo dry-run payload: missing `tasks` array.");
  }
  return parsed.tasks.filter((task) => task.command !== "<NONEXISTENT>").length;
}

export function evaluateGate(
  gate: GateName,
  dryRunJson: string,
  allowEmpty: ReadonlySet<GateName> = allowedEmpty,
): GateResult {
  const count = countTasks(dryRunJson);
  return { gate, count, ok: count > 0 || allowEmpty.has(gate) };
}
