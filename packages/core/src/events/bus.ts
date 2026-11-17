import { EventError } from "../errors.ts";
import type { Logger } from "../logger.ts";
import type { Unsubscribe } from "../ports/common.ts";
import {
  DEFAULT_HANDLER_TIMEOUT_MS,
  type EventBus,
  type EventBusOptions,
} from "../ports/event-bus.ts";
import { err, ok } from "../result.ts";
import type { Timer } from "./batching.ts";
import { type DomainEvent, type DomainEventType, domainEventSchema } from "./catalog.ts";

export type InMemoryEventBusOptions = EventBusOptions & {
  /** Handler failures are logged through this (redacting) Logger, never a raw sink. */
  readonly logger: Logger;
  readonly timer: Timer;
};

type Subscriber = {
  readonly types: ReadonlySet<DomainEventType> | "all";
  readonly handler: (event: DomainEvent) => void | Promise<void>;
  active: boolean;
  /** Tail of this subscriber's queue: keeps its own events in publish order. */
  tail: Promise<void>;
};

const TIMED_OUT = Symbol("timed out");

/** Implements the M1-03 `EventBus` port over the typed catalog. `publish` re-validates untrusted input. */
export function createInMemoryEventBus(options: InMemoryEventBusOptions): EventBus<DomainEvent> {
  const timeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
  const subscribers = new Set<Subscriber>();

  function report(code: "event.handler_failed" | "event.handler_timeout"): void {
    try {
      options.logger.error("event handler did not complete", { code });
    } catch {
      // A broken logger must not break delivery.
    }
  }

  async function deliver(subscriber: Subscriber, event: DomainEvent): Promise<void> {
    // Checked at delivery time: an unsubscribe also cancels events still queued.
    if (!subscriber.active) return;
    let cancel = () => {};
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      cancel = options.timer.set(() => resolve(TIMED_OUT), timeoutMs);
    });
    try {
      const run = Promise.resolve().then(() => subscriber.handler(event));
      // A handler that fails after its timeout must not become an unhandled rejection.
      run.catch(() => {});
      const outcome = await Promise.race([run, timeout]);
      if (outcome === TIMED_OUT) report("event.handler_timeout");
    } catch {
      report("event.handler_failed");
    } finally {
      cancel();
    }
  }

  function add(types: Subscriber["types"], handler: Subscriber["handler"]): Unsubscribe {
    const subscriber: Subscriber = { types, handler, active: true, tail: Promise.resolve() };
    subscribers.add(subscriber);
    return () => {
      subscriber.active = false;
      subscribers.delete(subscriber);
    };
  }

  return {
    async publish(input: unknown) {
      const parsed = domainEventSchema.safeParse(input);
      if (!parsed.success) return err(new EventError());
      const event = parsed.data;
      const pending: Promise<void>[] = [];
      for (const subscriber of [...subscribers]) {
        if (subscriber.types !== "all" && !subscriber.types.has(event.type)) continue;
        subscriber.tail = subscriber.tail.then(() => deliver(subscriber, event));
        pending.push(subscriber.tail);
      }
      await Promise.all(pending);
      return ok(undefined);
    },
    subscribe(type, handler) {
      return add(new Set<DomainEventType>([type]), handler as Subscriber["handler"]);
    },
  };
}
