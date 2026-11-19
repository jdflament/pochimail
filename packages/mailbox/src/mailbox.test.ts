// Guards: a message body, a foreign account's mail or a phantom event reaching storage, and a repository that loses labels, sequence or cursors.
import { unwrap } from "@pochimail/kernel/result";
import { describe, expect, it } from "vitest";
import { MAX_SNIPPET_CHARS } from "./policies/sanitize-incoming.ts";
import { createInMemoryMailbox } from "./testing/in-memory-mailbox.ts";
import {
  ACCOUNT_1,
  mailboxRepositoryContract,
  makeIncoming,
  WS_A,
} from "./testing/mailbox-repository-contract.ts";
import { StoreMessages } from "./use-cases/store-messages.ts";

mailboxRepositoryContract(() => createInMemoryMailbox());

describe("StoreMessages", () => {
  it("cuts snippets, drops foreign mail and announces one event (guards a body or a foreign message at rest)", async () => {
    const mailbox = createInMemoryMailbox();
    const store = new StoreMessages({ uow: mailbox.uow });
    const long = makeIncoming(1, { snippet: "x".repeat(MAX_SNIPPET_CHARS + 50) });
    const foreign = makeIncoming(2, { accountId: "acc-9" as typeof ACCOUNT_1 });
    const ids = unwrap(
      await store.execute({ workspaceId: WS_A, accountId: ACCOUNT_1, messages: [long, foreign] }),
    );
    expect(ids).toEqual([long.id]);
    expect(unwrap(await mailbox.uow.reads.messages.get(WS_A, long.id)).snippet).toHaveLength(
      MAX_SNIPPET_CHARS,
    );
    expect(mailbox.committedEvents().map((e) => e.type)).toEqual(["MessagesUpserted"]);
  });

  it("stores nothing and emits nothing for an empty or fully foreign batch (guards phantom events)", async () => {
    const mailbox = createInMemoryMailbox();
    const store = new StoreMessages({ uow: mailbox.uow });
    unwrap(await store.execute({ workspaceId: WS_A, accountId: ACCOUNT_1, messages: [] }));
    expect(mailbox.committedEvents()).toEqual([]);
  });
});
