import { createEventBatcher } from "./batcher.ts";
import {
  type EventOf,
  type InputOf,
  type OutputOf,
  type ProcedureName,
  procedureSchemas,
  type SubInputOf,
  type SubscriptionName,
  subscriptionSchemas,
} from "./contract.ts";
import {
  clientMessageSchema,
  type RpcErrorCode,
  type ServerMessage,
  withinMessageLimit,
} from "./protocol.ts";
import type { Transport } from "./transport.ts";

export type Handlers = {
  procedures: { [N in ProcedureName]?: (input: InputOf<N>) => Promise<OutputOf<N>> | OutputOf<N> };
  subscriptions: {
    [N in SubscriptionName]?: (
      input: SubInputOf<N>,
      emit: (event: EventOf<N>) => void,
    ) => (() => void) | undefined;
  };
};

const failure = (id: number, code: RpcErrorCode, message: string): ServerMessage => ({
  kind: "failure",
  id,
  error: { code, message },
});

/**
 * Worker side. Every inbound message and every outbound result/event is validated against the shared contract; a bad
 * message gets a typed error (or is dropped if it has no id) and never reaches a handler. Closing the port stops every
 * subscription and the batcher.
 */
export const serveRpc = (transport: Transport, handlers: Handlers): (() => void) => {
  const active = new Map<number, () => void>();
  const batcher = createEventBatcher<unknown>((events) =>
    transport.post({ kind: "batch", events }),
  );
  const post = (message: ServerMessage): void => transport.post(message);
  let closed = false;

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    for (const stop of active.values()) stop();
    active.clear();
    batcher.stop();
  };
  transport.onClose(teardown);
  const failSubscription = (sub: number, code: RpcErrorCode, message: string): void => {
    active.get(sub)?.();
    active.delete(sub);
    batcher.drop(sub);
    post({ kind: "subscription-error", sub, error: { code, message } });
  };

  const call = async (id: number, procedure: string, rawInput: unknown): Promise<void> => {
    const schemas = procedureSchemas(procedure);
    if (schemas === undefined) {
      post(failure(id, "UNKNOWN_PROCEDURE", "unknown procedure"));
      return;
    }
    const input = schemas.input.safeParse(rawInput);
    if (!input.success) {
      post(failure(id, "BAD_INPUT", `invalid input for ${procedure}`));
      return;
    }
    const handler = handlers.procedures[procedure as ProcedureName] as
      | ((value: unknown) => unknown)
      | undefined;
    if (handler === undefined) {
      post(failure(id, "NOT_IMPLEMENTED", `${procedure} is not implemented`));
      return;
    }
    let output: unknown;
    try {
      output = await handler(input.data);
    } catch {
      // The cause may mention mail data: never forward it (AGENTS.md §5).
      post(failure(id, "HANDLER_FAILED", `${procedure} failed`));
      return;
    }
    const checked = schemas.output.safeParse(output);
    if (!checked.success) {
      post(failure(id, "BAD_OUTPUT", `invalid output from ${procedure}`));
      return;
    }
    if (!closed) post({ kind: "result", id, output: checked.data });
  };

  const subscribe = (sub: number, topic: string, rawInput: unknown): void => {
    const fail = (code: RpcErrorCode, message: string) =>
      post({ kind: "subscription-error", sub, error: { code, message } });
    const schemas = subscriptionSchemas(topic);
    if (schemas === undefined) {
      fail("UNKNOWN_PROCEDURE", "unknown subscription");
      return;
    }
    if (active.has(sub)) {
      fail("BAD_INPUT", "subscription id already in use");
      return;
    }
    const input = schemas.input.safeParse(rawInput);
    if (!input.success) {
      fail("BAD_INPUT", `invalid input for ${topic}`);
      return;
    }
    const handler = handlers.subscriptions[topic as SubscriptionName] as
      | ((value: unknown, emit: (event: unknown) => void) => (() => void) | undefined)
      | undefined;
    if (handler === undefined) {
      fail("NOT_IMPLEMENTED", `${topic} is not implemented`);
      return;
    }
    const keyOf = schemas.coalesceKey as ((event: unknown) => string) | undefined;
    // Registered before the handler runs, so a handler that emits synchronously is still tracked.
    const eventSchema = schemas.event;
    let stop: (() => void) | undefined;
    active.set(sub, () => stop?.());
    try {
      stop = handler(input.data, (event) => {
        if (closed || !active.has(sub)) return;
        const checked = eventSchema.safeParse(event);
        if (!checked.success) return; // a handler bug must not poison the stream; the event is dropped
        if (!batcher.push(sub, checked.data, keyOf?.(checked.data)))
          failSubscription(sub, "OVERFLOW", `${topic}: renderer is not keeping up`);
      });
    } catch {
      active.delete(sub);
      fail("HANDLER_FAILED", `${topic} failed`);
      return;
    }
  };

  transport.onMessage((data) => {
    if (closed) return;
    const message = withinMessageLimit(data)
      ? clientMessageSchema.safeParse(data)
      : ({ success: false } as const);
    if (!message.success) {
      // Malformed envelope: answer with a typed error when we can tell which call it was, else drop it.
      const id = (data as { id?: unknown } | null)?.id;
      if (typeof id === "number" && Number.isInteger(id) && id >= 0)
        post(failure(id, "BAD_INPUT", "malformed message"));
      return;
    }
    const value = message.data;
    if (value.kind === "call") void call(value.id, value.procedure, value.input);
    else if (value.kind === "subscribe") subscribe(value.id, value.topic, value.input);
    else if (value.kind === "unsubscribe") {
      active.get(value.id)?.();
      active.delete(value.id);
      batcher.drop(value.id);
    } else batcher.ack();
  });
  return teardown;
};
