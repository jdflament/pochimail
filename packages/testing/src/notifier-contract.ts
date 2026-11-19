import type { Notification, Notifier } from "@pochimail/core/ports/notifier";
import { type Check, check, registerContract } from "@pochimail/kernel/testing/contract";
import { expect } from "vitest";

export interface NotifierHarness {
  readonly notifier: Notifier;
  /** What the user was shown, in order. */
  shown(): readonly Notification[] | Promise<readonly Notification[]>;
}

export const notifierChecks: readonly Check<NotifierHarness>[] = [
  check(
    "shows each notification once, in order, with only kind and count (guards names or subjects leaking into notifications)",
    async ({ notifier, shown }) => {
      const first: Notification = { kind: "scan-complete", count: 120 };
      const second: Notification = { kind: "review-waiting", count: 3 };
      expect((await notifier.notify(first)).ok).toBe(true);
      expect((await notifier.notify(second)).ok).toBe(true);
      expect(await shown()).toEqual([first, second]);
      for (const n of await shown()) expect(Object.keys(n).sort()).toEqual(["count", "kind"]);
    },
  ),
];

/** Contract for any `Notifier`. `make` returns a fresh notifier that has shown nothing. */
export function notifierContract(make: () => NotifierHarness | Promise<NotifierHarness>): void {
  registerContract("Notifier contract", notifierChecks, make);
}
