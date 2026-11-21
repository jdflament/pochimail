// Guards: an event that crosses a boundary unvalidated, a domain's event missing from the catalog, and mail content riding along in a payload.

import { accountEvents } from "@pochimail/accounts/events";
import { actionEvents } from "@pochimail/actions/events";
import { classificationEvents } from "@pochimail/classification/events";
import { cleanupEvents } from "@pochimail/cleanup/events";
import { documentEvents } from "@pochimail/documents/events";
import { mailboxEvents } from "@pochimail/mailbox/events";
import { describe, expect, it } from "vitest";
import { domainEventSchema, parseDomainEvent, scanEvents } from "./events.ts";

const head = {
  id: "evt-1",
  version: 1,
  workspaceId: "w-1",
  occurredAt: "2026-01-01T00:00:00.000Z",
};

describe("domain event catalog", () => {
  it("holds every domain's events exactly once (guards an event a subscriber can never receive)", () => {
    const names = [
      ...accountEvents,
      ...mailboxEvents,
      ...classificationEvents,
      ...cleanupEvents,
      ...actionEvents,
      ...documentEvents,
      ...scanEvents,
    ].map((e) => e.shape.type.value);
    expect(new Set(names).size).toBe(names.length);
    expect(domainEventSchema.options).toHaveLength(names.length);
  });

  it("accepts a valid event and rejects an unknown type or a malformed payload", () => {
    const valid = { ...head, type: "ScanCompleted", payload: { accountId: "a-1", processed: 3 } };
    expect(parseDomainEvent(valid)?.type).toBe("ScanCompleted");
    expect(parseDomainEvent({ ...valid, type: "Nope" })).toBeUndefined();
    expect(
      parseDomainEvent({ ...valid, payload: { accountId: "a-1", processed: -1 } }),
    ).toBeUndefined();
  });

  it("strips a stray subject from a payload (guards mail content reaching a subscriber)", () => {
    const parsed = parseDomainEvent({
      ...head,
      type: "ScanCompleted",
      payload: { accountId: "a-1", processed: 1, subject: "Secret" },
    });
    expect(JSON.stringify(parsed)).not.toContain("Secret");
  });
});
