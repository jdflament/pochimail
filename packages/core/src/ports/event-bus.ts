import type { EventError } from "../errors.ts";
import type { WorkspaceId } from "../ids.ts";
import type { AsyncResult, Unsubscribe } from "./common.ts";

/**
 * The least the bus needs to know about an event; the typed catalog (M1-04) refines it.
 * Events carry IDs and enums only, never subjects, addresses or bodies.
 * `id` lets handlers be idempotent under at-least-once delivery.
 */
export interface BusEvent {
  readonly id: string;
  readonly type: string;
  readonly workspaceId: WorkspaceId;
}

export type EventHandler<E extends BusEvent> = (event: E) => Promise<void> | void;

export interface EventBusOptions {
  /** Per-handler time limit; a handler still running after it counts as failed. Default 30 000. */
  readonly handlerTimeoutMs?: number;
}

export const DEFAULT_HANDLER_TIMEOUT_MS = 30_000;

/**
 * In-process event bus (ADR 0003). The port is owned by M1-03; M1-04 implements it.
 *
 * - `publish` validates the event against the catalog: an invalid event returns
 *   `Err(EventError)` (code `event.invalid`) and reaches no subscriber. It never returns a
 *   storage error. Otherwise it resolves with `ok` once every subscriber has settled.
 * - Handlers are isolated: a throw or rejection is caught, reported through the redacting
 *   `Logger` (never a raw sink) and does not affect other subscribers. A handler that exceeds
 *   `handlerTimeoutMs` counts as failed and `publish` moves on.
 * - Delivery to each subscriber is in order.
 * - The outbox marks a row sent after `publish` resolves, so delivery is AT-LEAST-ONCE:
 *   **handlers must be idempotent** (key on `event.id`).
 * - `subscribe` returns an `Unsubscribe`; calling it more than once is harmless.
 */
export interface EventBus<E extends BusEvent = BusEvent> {
  publish(event: E): AsyncResult<void, EventError>;
  subscribe<T extends E["type"]>(
    type: T,
    handler: EventHandler<Extract<E, { readonly type: T }>>,
  ): Unsubscribe;
}
