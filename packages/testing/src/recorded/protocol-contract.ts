import type { IncomingMessage } from "@pochimail/core/domain/mail";
import { expect } from "vitest";
import { type Check, check, registerContract } from "../contract.ts";

// DEV/TEST ONLY.

export interface ProtocolHarness {
  /** What the fixture mailbox holds, read straight from the mbox. */
  readonly expected: readonly IncomingMessage[];
  /** Reads the whole mailbox back through one protocol (Gmail JSON, Graph JSON or IMAP). */
  read(): Promise<readonly IncomingMessage[]>;
}

const byId = (a: IncomingMessage, b: IncomingMessage) => a.id.localeCompare(b.id);

export const protocolChecks: readonly Check<ProtocolHarness>[] = [
  check(
    "the same fixture mailbox yields the same IncomingMessage set through this protocol (guards a reader that drops, duplicates or rewrites messages across pages)",
    async ({ expected, read }) => {
      const actual = await read();
      expect([...actual].sort(byId)).toEqual([...expected].sort(byId));
    },
  ),
  check(
    "no message id appears twice (guards a paging loop that re-reads the last page)",
    async ({ read }) => {
      const ids = (await read()).map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  ),
];

/** Run this against Gmail, Graph and IMAP readers, now the fixtures and later the real adapters. */
export function protocolContract(
  title: string,
  make: () => ProtocolHarness | Promise<ProtocolHarness>,
): void {
  registerContract(title, protocolChecks, make);
}
