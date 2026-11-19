import type { AsyncResult } from "./common.ts";
import type { StorageError } from "./errors.ts";
import type { EventEnvelope } from "./event.ts";

/** Where a domain's use case publishes events: appended inside the current transaction. */
export interface EventSink {
  append(events: readonly EventEnvelope[]): AsyncResult<void, StorageError>;
}
