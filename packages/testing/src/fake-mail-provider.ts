import type { Command } from "@pochimail/core/domain/action";
import type {
  AppliedCommand,
  MailProvider,
  MailProviderCapabilities,
  MailProviderError,
} from "@pochimail/core/ports/mail-provider";
import {
  Cancelled,
  Conflict,
  Offline,
  type ProviderError,
  RateLimited,
} from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "@pochimail/kernel/testing/faults";
import type { IncomingMessage } from "@pochimail/mailbox/model/message";
import type { SyncCursor } from "@pochimail/mailbox/ports/mail-reader";

export interface FakeMailProvider extends MailProvider {
  readonly faults: Faults<ProviderError>;
  /** Mail that arrives at the provider; the next `sync` returns it. */
  deliver(...messages: IncomingMessage[]): void;
  /** Gives `fetchBody` something to return for a message. */
  setBody(messageId: string, body: string): void;
  /** Every command the provider was asked to apply, in order. */
  appliedCommands(): readonly Command[];
  /** From now on every call fails with `Offline`, until `faults.clear()`. */
  simulateOffline(): void;
  /** From now on every call fails with `RateLimited`, until `faults.clear()`. */
  simulateRateLimit(retryAfterMs?: number): void;
}

const INVERSE: Record<Command["kind"], Command["kind"] | null> = {
  archive: "unarchive",
  unarchive: "archive",
  "apply-label": "remove-label",
  "remove-label": "apply-label",
  "mark-handled": "unmark-handled",
  "unmark-handled": "mark-handled",
  unsubscribe: null,
};

const DEFAULT_CAPABILITIES: MailProviderCapabilities = {
  organization: "labels",
  archive: "remove-inbox-label",
  batchModify: { maxCommands: 50 },
  deltaSync: true,
  pushWakeups: false,
  unsubscribeSend: true,
};

export function createFakeMailProvider(
  options: { capabilities?: Partial<MailProviderCapabilities>; pageSize?: number } = {},
): FakeMailProvider {
  const mailbox: IncomingMessage[] = [];
  const bodies = new Map<string, string>();
  const applied: Command[] = [];
  const faults = createFaults<ProviderError>();
  const pageSize = options.pageSize ?? 50;
  const SCOPE = "inbox";

  const gate = (signal: { aborted: boolean }) => (signal.aborted ? new Cancelled() : faults.take());

  return {
    capabilities: { ...DEFAULT_CAPABILITIES, ...options.capabilities },
    faults,
    deliver: (...messages) => void mailbox.push(...structuredClone(messages)),
    setBody: (id, body) => void bodies.set(id, body),
    appliedCommands: () => structuredClone(applied),
    simulateOffline: () => faults.failWith(new Offline()),
    simulateRateLimit: (retryAfterMs) =>
      faults.failWith(new RateLimited(retryAfterMs === undefined ? {} : { retryAfterMs })),
    async sync(cursor, signal) {
      const failure = gate(signal);
      if (failure) return err(failure as MailProviderError);
      const start = cursor === null ? 0 : Number(cursor.token);
      const end = Math.min(start + pageSize, mailbox.length);
      const nextCursor: SyncCursor = { scope: SCOPE, token: String(end) };
      return ok({
        messages: structuredClone(mailbox.slice(start, end)),
        nextCursor,
        hasMore: end < mailbox.length,
        restarted: false,
      });
    },
    async applyCommands(commands, signal) {
      const failure = gate(signal);
      if (failure) return err(failure as MailProviderError);
      const out: AppliedCommand[] = commands.map((command) => {
        applied.push(structuredClone(command));
        const kind = INVERSE[command.kind];
        return { command, inverse: kind === null ? null : { ...command, kind } };
      });
      return ok(out);
    },
    async fetchBody(messageId, signal) {
      const failure = gate(signal);
      if (failure) return err(failure as MailProviderError);
      const body = bodies.get(messageId);
      return body === undefined ? err(new Conflict("Message no longer exists")) : ok(body);
    },
  };
}
