import { createLogger } from "@pochimail/core/logger";
import { SummarizeMailbox } from "@pochimail/core/use-cases/summarize-mailbox";
import { createFakeTimer } from "@pochimail/testing/fake-timer";
import {
  generateMailbox,
  MAILBOX_SCALES,
  MOCK_DATASET,
} from "@pochimail/testing/fixture-mailbox/generator";
import { createGroundTruthClassifier } from "@pochimail/testing/ground-truth-classifier";
import { describe, expect, it } from "vitest";
import { DEMO_SEED } from "../shared/demo.ts";
import { createWorkerApp } from "./app.ts";
import { createFixtureAdapters } from "./fixture-adapters.ts";

// Slow on purpose (about a minute): it is the only check at the real mailbox size of brief §6. CI runs it with the rest.
describe("worker app at the brief §6 mock dataset size", () => {
  it("scanning the full fixture stores all 48,312 emails of both accounts (guards a scan that drops mail at real mailbox size)", async () => {
    const mailbox = generateMailbox({ seed: DEMO_SEED, scale: "full" });
    const labels = new Map(mailbox.labels.messages.map((l) => [l.messageId, l.category] as const));
    expect(mailbox.labels.totals.messages).toBe(MOCK_DATASET.totalMessages);
    expect(MAILBOX_SCALES.full).toBe(MOCK_DATASET.totalMessages);

    let jobs = 0;
    const adapters = await createFixtureAdapters({
      scale: "full",
      timer: createFakeTimer(),
      logger: createLogger({ sink: { write: () => {} } }),
      deviceName: () => "Mac",
      classifier: createGroundTruthClassifier(labels),
      newJobId: () => `job-${++jobs}`,
      pageSize: 1_000,
    });
    const app = createWorkerApp(adapters);
    for (const account of mailbox.accounts)
      await app.handlers.procedures["scan.start"]?.({ accountId: account.id });
    await app.idle();

    const overview = await app.handlers.procedures["overview.get"]?.(undefined);
    expect(overview?.scanned).toBe(MOCK_DATASET.totalMessages);

    // Category totals are the ones on the reference screens.
    const summary = await new SummarizeMailbox({
      uow: adapters.uow,
      clock: adapters.clock,
    }).execute({
      workspaceId: adapters.workspaceId,
      accountIds: mailbox.accounts.map((a) => a.id as never),
    });
    expect(summary.ok && summary.value.categories).toEqual(MOCK_DATASET.categories);
  }, 600_000);
});
