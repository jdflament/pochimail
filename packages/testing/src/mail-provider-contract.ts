import type { Command } from "@pochimail/core/domain/action";
import type { IncomingMessage } from "@pochimail/core/domain/mail";
import type { MessageId } from "@pochimail/core/ids";
import type { MailProvider, SyncCursor } from "@pochimail/core/ports/mail-provider";
import { unwrap } from "@pochimail/kernel/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";
import { makeIncomingMessage } from "./fixtures.ts";

export interface MailProviderHarness {
  readonly provider: MailProvider;
  /** Puts these messages in the mailbox the provider syncs from. */
  deliver(...messages: IncomingMessage[]): void | Promise<void>;
}

const live = () => new AbortController().signal;
const id = (n: number) => `msg-${n}` as MessageId;

async function syncAll(provider: MailProvider, from: SyncCursor | null) {
  const messages: IncomingMessage[] = [];
  let cursor = from;
  for (let guard = 0; guard < 100; guard++) {
    const batch = unwrap(await provider.sync(cursor, live()));
    messages.push(...batch.messages);
    cursor = batch.nextCursor;
    if (!batch.hasMore) return { messages, cursor };
  }
  throw new Error("sync never finished");
}

export const mailProviderChecks: readonly Check<MailProviderHarness>[] = [
  check(
    "a first sync returns every message across pages (guards a backfill that stops early)",
    async ({ provider, deliver }) => {
      await deliver(...[1, 2, 3, 4, 5].map((n) => makeIncomingMessage(n)));
      const { messages } = await syncAll(provider, null);
      expect(messages.map((m) => m.id).sort()).toEqual([1, 2, 3, 4, 5].map(id).sort());
    },
  ),
  check(
    "syncing from the last cursor returns only new mail (guards re-importing the whole mailbox)",
    async ({ provider, deliver }) => {
      await deliver(makeIncomingMessage(1), makeIncomingMessage(2));
      const first = await syncAll(provider, null);
      await deliver(makeIncomingMessage(3));
      const second = await syncAll(provider, first.cursor);
      expect(second.messages.map((m) => m.id)).toEqual([id(3)]);
    },
  ),
  check(
    "applyCommands answers each command in order and records an inverse for the reversible ones (guards undo that has to guess)",
    async ({ provider }) => {
      const commands: Command[] = [
        { kind: "archive", messageIds: [id(1)] },
        { kind: "unsubscribe", messageIds: [id(2)] },
      ];
      const out = unwrap(await provider.applyCommands(commands, live()));
      expect(out.map((a) => a.command)).toEqual(commands);
      expect(out[0]?.inverse).toEqual({ kind: "unarchive", messageIds: [id(1)] });
      expect(out[1]?.inverse).toBeNull();
    },
  ),
  check(
    "every call is Cancelled when the signal is already aborted (guards provider calls after cancel)",
    async ({ provider }) => {
      const c = new AbortController();
      c.abort();
      const results = [
        await provider.sync(null, c.signal),
        await provider.applyCommands([{ kind: "archive", messageIds: [id(1)] }], c.signal),
        await provider.fetchBody(id(1), c.signal),
      ];
      for (const r of results) {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("operation.cancelled");
      }
    },
  ),
];

/** Contract for any `MailProvider`. `make` returns a fresh provider over an empty mailbox. */
export function mailProviderContract(
  make: () => MailProviderHarness | Promise<MailProviderHarness>,
): void {
  registerContract("MailProvider contract", mailProviderChecks, make);
}
