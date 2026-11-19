import type { AsyncResult } from "@pochimail/kernel/common";
import type { StorageError } from "@pochimail/kernel/errors";
import type { EventSink } from "@pochimail/kernel/event-sink";
import { ok } from "@pochimail/kernel/result";
import type { OutboxEntry } from "./outbox.ts";

/** Publishes domain events as event entries of the outbox, in order, inside its transaction. */
export function eventSinkOver(outbox: {
  append(entry: OutboxEntry): AsyncResult<void, StorageError>;
}): EventSink {
  return {
    async append(events) {
      for (const event of events) {
        const appended = await outbox.append({ kind: "event", event });
        if (!appended.ok) return appended;
      }
      return ok(undefined);
    },
  };
}
