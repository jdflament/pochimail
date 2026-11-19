import type { Unsubscribe } from "@pochimail/kernel/common";
import { EventError } from "@pochimail/kernel/errors";
import type { EventEnvelope } from "@pochimail/kernel/event";
import { err, ok } from "@pochimail/kernel/result";
import type { Logger } from "@pochimail/logger/logger";
import type { Timer } from "./event-batching.ts";
import { DEFAULT_HANDLER_TIMEOUT_MS, type EventBus, type EventBusOptions } from "./event-bus.ts";

export type InMemoryEventBusOptions<E extends EventEnvelope> = EventBusOptions & {
  /** Validates untrusted input against the owner's event catalog; `undefined` rejects it. */
  readonly parse: (input: unknown) => E | undefined;
  /** Handler failures are logged through this (redacting) Logger, never a raw sink. */
  readonly logger: Logger;
  readonly timer: Timer;
};

type Subscriber = {
  readonly types: ReadonlySet<string> | "all";
  readonly handler: (event: EventEnvelope) => void | Promise<void>;
  active: boolean;
  /** Tail of this subscriber's queue: keeps its own events in publish order. */
  tail: Promise<void>;
};

const TIMED_OUT = Symbol("timed out");

/** Implements the M1-03 `EventBus` port over the owner's typed catalog. `publish` re-validates untrusted input. */
export function createInMemoryEventBus<E extends EventEnvelope>(
  options: InMemoryEventBusOptions<E>,
): EventBus<E> {
  const timeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
  const subscribers = new Set<Subscriber>();

  function report(code: "event.handler_failed" | "event.handler_timeout"): void {
    try {
      options.logger.error("event handler did not complete", { code });
    } catch {
      // A broken logger must not break delivery.
    }
  }

  async function deliver(subscriber: Subscriber, event: EventEnvelope): Promise<void> {
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
      const event = options.parse(input);
      if (!event) return err(new EventError());
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
      return add(new Set<string>([type]), handler as Subscriber["handler"]);
    },
  };
}
