import { Cancelled, type StorageError } from "@pochimail/core/errors";
import type { Exporter } from "@pochimail/core/ports/exporter";
import { err, ok } from "@pochimail/core/result";
import { createFaults, type Faults } from "./faults.ts";

export interface FakeExporter extends Exporter {
  readonly faults: Faults<StorageError>;
}

/** Writes only the request itself, which is enough to prove callers handle files and failures. */
export function createFakeExporter(): FakeExporter {
  const faults = createFaults<StorageError>();
  return {
    faults,
    async export(request, signal) {
      if (signal.aborted) return err(new Cancelled());
      const failure = faults.take();
      if (failure) return err(failure);
      const text =
        request.format === "json"
          ? JSON.stringify({ workspaceId: request.workspaceId, scope: request.scope })
          : `workspaceId,scope\n${request.workspaceId},${request.scope}\n`;
      return ok({
        filename: `pochimail-${request.scope}.${request.format}`,
        bytes: new TextEncoder().encode(text),
      });
    },
  };
}
