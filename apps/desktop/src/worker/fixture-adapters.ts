import type { Clock } from "@pochimail/core/clock";
import type { Account } from "@pochimail/core/domain/account";
import type { Timer } from "@pochimail/core/events/batching";
import { AccountId, WorkspaceId } from "@pochimail/core/ids";
import type { Logger } from "@pochimail/core/logger";
import type { Classifier } from "@pochimail/core/ports/ai";
import type { DeviceName } from "@pochimail/core/ports/platform";
import { unwrap } from "@pochimail/core/result";
import { createFixtureMailProvider } from "@pochimail/testing/fixture-mailbox/fixture-mail-provider";
import { FIXTURE_NOW, generateMailbox } from "@pochimail/testing/fixture-mailbox/generator";
import { createInMemoryJobQueue } from "@pochimail/testing/in-memory-job-queue";
import { createInMemorySettingsStore } from "@pochimail/testing/in-memory-settings-store";
import { createInMemoryUnitOfWork } from "@pochimail/testing/in-memory-store";
import { DEMO_SEED, type DemoScale } from "../shared/demo.ts";
import type { WorkerAdapters } from "./app.ts";

export interface FixtureAdapterOptions {
  readonly scale: DemoScale;
  readonly timer: Timer;
  readonly logger: Logger;
  readonly deviceName: () => DeviceName;
  /** Answers classification; in the app this is the model host link. */
  readonly classifier: Classifier;
  readonly newJobId: () => string;
  /** Messages per provider page. Default 100. */
  readonly pageSize?: number;
}

/**
 * The fixture bundle (dev/E2E only): the mock dataset of brief §6 as two accounts, an in-memory store and queue, no
 * network and no real account. M2's SQLite and real provider adapters replace this bundle without touching the handlers.
 */
export async function createFixtureAdapters(
  options: FixtureAdapterOptions,
): Promise<WorkerAdapters> {
  const mailbox = generateMailbox({ seed: DEMO_SEED, scale: options.scale });
  // "Today" inside the fixture is fixed (ages and signals depend on it) but keeps moving, so retry back-off still elapses.
  const startedAt = Date.now();
  const clock: Clock = { now: () => new Date(FIXTURE_NOW + (Date.now() - startedAt)) };
  const workspaceId = unwrap(WorkspaceId(mailbox.workspaceId));
  const store = createInMemoryUnitOfWork();
  const accounts: Account[] = mailbox.accounts.map((account) => ({
    schemaVersion: 1,
    id: unwrap(AccountId(account.id)),
    workspaceId,
    provider: account.provider,
    address: account.address,
    connectedAt: clock.now().toISOString(),
    grantedScopes: [],
  }));
  const seeded = await store.uow.run(async (tx) => {
    for (const account of accounts) {
      const saved = await tx.repositories.accounts.save(account);
      if (!saved.ok) return saved;
    }
    return { ok: true as const, value: undefined };
  });
  if (!seeded.ok) throw seeded.error;

  const providers = new Map(
    mailbox.accounts.map((account) => [
      account.id,
      createFixtureMailProvider({
        mbox: account.mbox,
        accountId: account.id,
        workspaceId: mailbox.workspaceId,
        pageSize: options.pageSize ?? 100,
      }),
    ]),
  );
  return {
    workspaceId,
    clock: clock,
    random: Math.random,
    timer: options.timer,
    logger: options.logger,
    newJobId: options.newJobId,
    uow: store.uow,
    outboxStore: store.outboxStore,
    queue: createInMemoryJobQueue(clock),
    settings: createInMemorySettingsStore(),
    classifier: options.classifier,
    providerFor: (account) => {
      const provider = providers.get(account.id);
      if (provider === undefined) throw new Error("no fixture for this account");
      return provider;
    },
    deviceName: options.deviceName,
  };
}
