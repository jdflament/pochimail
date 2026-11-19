import type { AccountId } from "@pochimail/kernel/ids";
import { unwrap } from "@pochimail/kernel/result";
import { ACCOUNT_1, WS_A } from "@pochimail/testing/fixtures";
import { describe, expect, it } from "vitest";
import { harness, mail, put } from "./test-support/harness.ts";

const stamp = "2026-01-01T00:00:00.000Z";

describe("digest cursor", () => {
  it("stays after a removed account's mail, so new mail is never skipped (guards sequence reuse after deletes)", async () => {
    const h = harness();
    const other = "acc-2" as AccountId;
    await put(h, [mail(1), mail(2, { accountId: other }), mail(3, { accountId: other })]);
    const before = unwrap(await h.uow.reads.messages.latestSequence(WS_A, ACCOUNT_1));
    await h.uow.run((tx) => tx.repositories.accounts.remove(WS_A, other));
    await put(h, [mail(4)]);
    const after = unwrap(await h.uow.reads.messages.latestSequence(WS_A, ACCOUNT_1));
    expect(after).toBeGreaterThan(3);
    expect(after).toBeGreaterThan(before);
  });
});

describe("digest state", () => {
  it("keeps the covered sequence when only the date is set (guards re-reporting everything after a 3-argument call)", async () => {
    const h = harness();
    await h.uow.run((tx) => tx.repositories.digestState.set(WS_A, ACCOUNT_1, stamp, 7));
    await h.uow.run((tx) =>
      tx.repositories.digestState.set(WS_A, ACCOUNT_1, "2026-01-02T00:00:00.000Z"),
    );
    expect(unwrap(await h.uow.reads.digestState.getSequence(WS_A, ACCOUNT_1))).toBe(7);
  });
});
