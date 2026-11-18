import type { WorkspaceId } from "@pochimail/core/ids";
import type { Exporter } from "@pochimail/core/ports/exporter";
import { unwrap } from "@pochimail/core/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

const ws = "ws-export" as WorkspaceId;
const live = () => new AbortController().signal;

export const exporterChecks: readonly Check<Exporter>[] = [
  check("the filename extension matches the format (guards a .csv that holds JSON)", async (e) => {
    const json = unwrap(await e.export({ workspaceId: ws, scope: "all", format: "json" }, live()));
    const csv = unwrap(await e.export({ workspaceId: ws, scope: "all", format: "csv" }, live()));
    expect(json.filename.endsWith(".json")).toBe(true);
    expect(csv.filename.endsWith(".csv")).toBe(true);
    expect(() => JSON.parse(new TextDecoder().decode(json.bytes))).not.toThrow();
  }),
  check("an aborted signal is Cancelled (guards an export finishing after cancel)", async (e) => {
    const c = new AbortController();
    c.abort();
    const r = await e.export({ workspaceId: ws, scope: "senders", format: "json" }, c.signal);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("operation.cancelled");
  }),
];

/** Contract for any `Exporter`. */
export function exporterContract(make: () => Exporter | Promise<Exporter>): void {
  registerContract("Exporter contract", exporterChecks, make);
}
