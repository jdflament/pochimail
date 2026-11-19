import type { Category } from "@pochimail/core/domain/category";
import type { IncomingMessage } from "@pochimail/core/domain/mail";
import type { MessageId } from "@pochimail/core/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import { ACCOUNT_1, WS_A } from "@pochimail/testing/fixtures";
import { describe, expect, it } from "vitest";
import { harness, mail, put, sender } from "./test-support/harness.ts";

describe("100,000 messages", () => {
  it("keeps indexed top-50 and sender GROUP BY inside their budgets and finds by subject (guards a missing index or full scans)", {
    timeout: 120_000,
  }, async () => {
    const h = harness();
    const categories: Category[] = ["people", "newsletters", "promotions", "records"];
    const t0 = performance.now();
    const batch: IncomingMessage[] = [];
    for (let n = 1; n <= 100_000; n++)
      batch.push(
        mail(n, {
          from: sender(n % 2000),
          subject: n === 77_777 ? "Needle in the haystack" : `Update ${n % 500}`,
          threadId: `thr-${n}` as never,
        }),
      );
    await put(h, batch);
    const insertMs = performance.now() - t0;
    await h.uow.run(async (tx) => {
      for (let n = 1; n <= 100_000; n += 7)
        await tx.repositories.messages.setCategory(
          WS_A,
          `msg-${n}` as MessageId,
          categories[n % 4] as Category,
        );
      return ok(undefined);
    });

    const time = async <T>(run: () => T | Promise<T>) => {
      const s = performance.now();
      const value = await run();
      return { ms: performance.now() - s, value };
    };
    const top = await time(() =>
      h.uow.reads.messages.query(WS_A, { accountId: ACCOUNT_1, category: "people", limit: 50 }),
    );
    const bySender = await time(
      () =>
        h.storage.reader
          .prepare(
            "SELECT sender, count(*) AS n FROM message WHERE workspace_id = ? AND account_id = ? GROUP BY sender ORDER BY n DESC LIMIT 50",
          )
          .all(WS_A, ACCOUNT_1) as unknown[],
    );
    const statsTop = await time(() => h.uow.reads.senders.list(WS_A, ACCOUNT_1, { limit: 50 }));
    const found = await time(() => h.search.search(WS_A, ACCOUNT_1, "needle", 10));
    const plan = h.storage.reader
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM message WHERE workspace_id = ? AND account_id = ? AND category = ? ORDER BY received_at DESC, id LIMIT 50",
      )
      .all(WS_A, ACCOUNT_1, "people") as { detail: string }[];
    process.stderr.write(
      `[M2-03 budgets] insert 100k ${insertMs.toFixed(0)} ms; top-50 ${top.ms.toFixed(1)} ms; sender GROUP BY ${bySender.ms.toFixed(1)} ms; stats list ${statsTop.ms.toFixed(1)} ms; FTS5 ${found.ms.toFixed(1)} ms\n`,
    );

    expect(unwrap(top.value).items).toHaveLength(50);
    expect(plan.map((p) => p.detail).join(" ")).toContain("message_by_category");
    expect(top.ms).toBeLessThan(100);
    expect(bySender.ms).toBeLessThan(1500);
    expect(statsTop.ms).toBeLessThan(100);
    expect(found.ms).toBeLessThan(200);
    expect(unwrap(found.value).map((m) => m.subject)).toEqual(["Needle in the haystack"]);
    expect(unwrap(await h.search.search(WS_A, ACCOUNT_1, "zanzibarquartz", 10))).toEqual([]);
  });
});
