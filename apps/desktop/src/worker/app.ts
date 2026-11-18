import type { Clock } from "@pochimail/core/clock";
import type { Account } from "@pochimail/core/domain/account";
import type { Timer } from "@pochimail/core/events/batching";
import { createInMemoryEventBus } from "@pochimail/core/events/bus";
import type { WorkspaceId } from "@pochimail/core/ids";
import { createOutboxRelay } from "@pochimail/core/jobs/outbox-relay";
import type { Logger } from "@pochimail/core/logger";
import type { Classifier } from "@pochimail/core/ports/ai";
import type { JobQueue } from "@pochimail/core/ports/job-queue";
import type { MailProvider } from "@pochimail/core/ports/mail-provider";
import type { OutboxStore } from "@pochimail/core/ports/outbox";
import type { DeviceName } from "@pochimail/core/ports/platform";
import type { SettingsStore } from "@pochimail/core/ports/settings-store";
import type { UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { GetOverview } from "@pochimail/core/use-cases/get-overview";
import { LatestDigest } from "@pochimail/core/use-cases/latest-digest";
import { ListAccounts } from "@pochimail/core/use-cases/list-accounts";
import { ManageSettings } from "@pochimail/core/use-cases/manage-settings";
import { RunScan } from "@pochimail/core/use-cases/run-scan";
import { ScanRunner } from "@pochimail/core/use-cases/scan-runner";
import type { Handlers } from "../shared/ipc/server.ts";
import { createHandlers } from "./handlers.ts";

/**
 * Everything the worker needs from the outside, as ports. The fixture bundle (dev/E2E) and M2's SQLite and real
 * provider adapters are two implementations of this one shape; nothing in `createWorkerApp` or the handlers names either.
 */
export interface WorkerAdapters {
  readonly workspaceId: WorkspaceId;
  readonly clock: Clock;
  readonly random: () => number;
  readonly timer: Timer;
  readonly logger: Logger;
  /** A new, unique id for a scan job. */
  readonly newJobId: () => string;
  readonly uow: UnitOfWork;
  readonly outboxStore: OutboxStore;
  readonly queue: JobQueue;
  readonly settings: SettingsStore;
  readonly classifier: Classifier;
  /** The mail provider of one connected account. */
  readonly providerFor: (account: Account) => MailProvider;
  readonly deviceName: () => DeviceName;
}

export interface WorkerApp {
  readonly handlers: Handlers;
  /** Resolves once every running scan has stopped (orderly shutdown, tests). */
  idle(): Promise<void>;
}

/** The worker's composition root: core use cases wired to the adapters it is given, behind the typed IPC handlers. */
export function createWorkerApp(adapters: WorkerAdapters): WorkerApp {
  const { uow, workspaceId, clock } = adapters;
  const bus = createInMemoryEventBus({ logger: adapters.logger, timer: adapters.timer });
  const relay = createOutboxRelay({ store: adapters.outboxStore, bus, queue: adapters.queue });

  // One drain at a time, so a row is never delivered twice by two overlapping drains.
  let draining: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => {
    draining = draining.then(async () => {
      const drained = await relay.drain();
      if (!drained.ok) adapters.logger.error("event delivery failed", { code: drained.error.code });
    });
    return draining;
  };
  void flush(); // events committed before a restart still go out

  const latestDigest = new LatestDigest();
  bus.subscribe("DigestReady", (event) => latestDigest.handle(event));

  const scans = new ScanRunner({
    uow,
    workspaceId,
    newJobId: adapters.newJobId,
    scanFor: (account) =>
      new RunScan({
        uow,
        provider: adapters.providerFor(account),
        classifier: adapters.classifier,
        clock,
        queue: adapters.queue,
        random: adapters.random,
        workspaceId,
        accountId: account.id,
        flush,
      }),
  });

  const handlers = createHandlers({
    workspaceId,
    listAccounts: new ListAccounts({ uow }),
    getOverview: new GetOverview({ uow, clock }),
    latestDigest,
    settings: new ManageSettings({ store: adapters.settings }),
    scans,
    events: bus,
    deviceName: adapters.deviceName,
  });
  return { handlers, idle: () => scans.idle() };
}
