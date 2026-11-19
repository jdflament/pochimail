import type { EventEnvelope } from "@pochimail/kernel/event";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { createLogger } from "@pochimail/logger/logger";
import { expect, it } from "vitest";
import { createInMemoryEventBus } from "./in-memory-event-bus.ts";

const timer = { set: () => () => {} };
const logger = createLogger({ sink: { write: () => {} } });
type Ping = EventEnvelope & { readonly type: "Ping" };
const event: Ping = { id: "e1", type: "Ping", workspaceId: "wsp_1" as WorkspaceId };
const bus = () =>
  createInMemoryEventBus<Ping>({
    parse: (input) => (input === event ? event : undefined),
    logger,
    timer,
  });

// Guards: an event the owner's catalog rejects reaching a subscriber.
it("refuses input the injected parser rejects and delivers what it accepts", async () => {
  const b = bus();
  const seen: string[] = [];
  b.subscribe("Ping", (e) => void seen.push(e.id));
  const bad = await b.publish({ ...event, id: "other" });
  expect(bad.ok).toBe(false);
  expect((await b.publish(event)).ok).toBe(true);
  expect(seen).toEqual(["e1"]);
});

// Guards: one failing handler stopping delivery to the others.
it("isolates a throwing handler from other subscribers", async () => {
  const b = bus();
  const seen: string[] = [];
  b.subscribe("Ping", () => {
    throw new Error("boom");
  });
  b.subscribe("Ping", (e) => void seen.push(e.id));
  expect((await b.publish(event)).ok).toBe(true);
  expect(seen).toEqual(["e1"]);
});
