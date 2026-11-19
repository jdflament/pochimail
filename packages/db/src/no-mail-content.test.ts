import type { MessageId } from "@pochimail/core/ids";
import { unwrap } from "@pochimail/kernel/result";
import { makeDerived } from "@pochimail/testing/derived-contract";
import { ACCOUNT_1, makeSuggestion, makeThread, WS_A } from "@pochimail/testing/fixtures";
import { makeSignal } from "@pochimail/testing/signal-repository-contract";
import { describe, expect, it } from "vitest";
import { harness, mail } from "./test-support/harness.ts";

describe("D11: no mail content at rest (ADR 0009)", () => {
  it("no table or column is named or typed to hold a message body or attachment bytes (guards a schema that can store mail text)", () => {
    const { storage } = harness();
    const tables = storage.reader
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'message_search_%'",
      )
      .all() as { name: string }[];
    expect(tables.length).toBeGreaterThan(10);
    const forbidden =
      /(^|[^a-z])(body|bodies|html|text|content|contents|raw|mime|attachment|attachments|blob|bytes|file|eml)([^a-z]|$)/;
    const offenders: string[] = [];
    for (const { name } of tables) {
      if (forbidden.test(name.toLowerCase())) offenders.push(name);
      const columns = storage.reader.prepare(`PRAGMA table_xinfo("${name}")`).all() as {
        name: string;
        type: string;
        hidden: number;
      }[];
      // The FTS5 table's own hidden columns (table name, rank) are not data; its real columns
      // are pinned by the next test.
      for (const c of columns.filter((x) => x.hidden === 0 && name !== "message_search")) {
        const words = c.name
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/[^a-z0-9]+/);
        if (words.some((w) => forbidden.test(w)) || /blob|any/i.test(c.type) || c.type === "")
          offenders.push(`${name}.${c.name}:${c.type}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the full-text index covers exactly sender, subject, snippet, category and signals (guards indexing anything else)", () => {
    const { storage } = harness();
    const columns = (
      storage.reader.prepare('PRAGMA table_xinfo("message_search")').all() as {
        name: string;
        hidden: number;
      }[]
    )
      .filter((c) => c.hidden === 0)
      .map((c) => c.name);
    expect(columns).toEqual(["sender", "subject", "snippet", "category", "signals"]);
  });

  it("refuses a snippet longer than the cap, so a body cannot be stored in it (guards bodies hidden in snippets)", async () => {
    const h = harness();
    const r = await h.uow.run(async (tx) =>
      tx.repositories.messages.upsertMany([mail(1, { snippet: "x".repeat(5000) })]),
    );
    expect(r.ok).toBe(false);
    expect(
      unwrap(await h.uow.reads.messages.query(WS_A, { accountId: ACCOUNT_1, limit: 5 })).items,
    ).toEqual([]);
  });
});

describe("free-text caps (D11: a body cannot hide in a reason or subject)", () => {
  const long = (n: number) => "x".repeat(n);
  const cases: [string, (h: ReturnType<typeof harness>) => Promise<{ ok: boolean }>][] = [
    [
      "derived.reason",
      (h) => h.uow.run((tx) => tx.repositories.derived.save(makeDerived(1, { reason: long(501) }))),
    ],
    [
      "signal.reason",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.signals.replaceForMessages(
            WS_A,
            ["msg-1" as MessageId],
            [makeSignal(1, { reason: long(501) })],
          ),
        ),
    ],
    [
      "suggestion.reasons",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.suggestions.save(makeSuggestion({ reasons: [long(2001)] })),
        ),
    ],
    [
      "message.suspicious_reasons",
      (h) =>
        h.uow.run((tx) =>
          tx.repositories.messages.upsertMany([
            mail(1, { suspicious: { reasons: [long(2001)], confidence: 0.5 } }),
          ]),
        ),
    ],
    [
      "thread.subject",
      (h) => h.uow.run((tx) => tx.repositories.threads.upsert(makeThread({ subject: long(4001) }))),
    ],
  ];
  it.each(cases)(
    "refuses an over-long %s (guards unbounded text in that column)",
    async (_c, attempt) => {
      expect((await attempt(harness())).ok).toBe(false);
    },
  );
});
