import { accountSchema } from "@pochimail/accounts/model/account";
import { actionLogSchema, actionSchema } from "@pochimail/actions/model/action";
import { signalSchema } from "@pochimail/classification/model/signal";
import { topicSchema } from "@pochimail/classification/model/topic";
import { suggestionSchema } from "@pochimail/cleanup/model/suggestion";
import { attachmentSchema } from "@pochimail/documents/model/attachment";
import { incomingMessageSchema, messageSchema } from "@pochimail/mailbox/model/message";
import { senderStatsSchema } from "@pochimail/mailbox/model/sender-stats";
import { threadSchema } from "@pochimail/mailbox/model/thread";
import { describe, expect, it } from "vitest";
import { rng, sampleBuilders } from "./domain-samples.ts";

const SAMPLES_PER_ENTITY = 200;

/**
 * Contract: every entity survives JSON serialisation unchanged. Exported so M2 adapters
 * (SQLite, real providers) can run the same suite over what they store and return.
 * `roundTrip` defaults to JSON; adapters pass their own persist-then-load function.
 */
export function entityRoundTripContract(
  roundTrip: (value: unknown) => unknown = (v) => JSON.parse(JSON.stringify(v)),
): void {
  const entities: [
    string,
    { parse(value: unknown): unknown },
    (r: ReturnType<typeof rng>) => unknown,
  ][] = [
    ["Account", accountSchema, sampleBuilders.account],
    ["IncomingMessage", incomingMessageSchema, sampleBuilders.incomingMessage],
    ["Message", messageSchema, sampleBuilders.message],
    ["Thread", threadSchema, sampleBuilders.thread],
    ["SenderStats", senderStatsSchema, sampleBuilders.senderStats],
    ["Attachment", attachmentSchema, sampleBuilders.attachment],
    ["Topic", topicSchema, sampleBuilders.topic],
    ["Signal", signalSchema, sampleBuilders.signal],
    ["Suggestion", suggestionSchema, sampleBuilders.suggestion],
    ["Action", actionSchema, sampleBuilders.action],
    ["ActionLog", actionLogSchema, sampleBuilders.actionLog],
  ];
  describe("entity JSON round-trip contract", () => {
    for (const [name, schema, build] of entities) {
      it(`${name} loses nothing through serialise then parse (guards lossy fields such as Dates)`, () => {
        const r = rng(name.length * 7919);
        for (let i = 0; i < SAMPLES_PER_ENTITY; i++) {
          const sample = build(r);
          const parsed = schema.parse(sample);
          expect(schema.parse(roundTrip(parsed))).toEqual(parsed);
          expect(parsed).toEqual(sample);
        }
      });
    }
  });
}
