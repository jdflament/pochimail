import { Offline, RateLimited, StorageError } from "@pochimail/core/errors";
import type { WorkspaceId } from "@pochimail/core/ids";
import { ok } from "@pochimail/core/result";
import { describe, expect, it } from "vitest";
import { classifierContract, embedderContract, llmProviderContract } from "./ai-contract.ts";
import { blobStoreContract } from "./blob-store-contract.ts";
import { digestStateContract } from "./digest-state-contract.ts";
import { exporterContract } from "./exporter-contract.ts";
import { createFakeClassifier, createFakeEmbedder, createFakeLlmProvider } from "./fake-ai.ts";
import { createFakeClock } from "./fake-clock.ts";
import { createFakeExporter } from "./fake-exporter.ts";
import { createFakeMailProvider } from "./fake-mail-provider.ts";
import { createFakePlatform } from "./fake-platform.ts";
import { createFakePowerMonitor } from "./fake-power-monitor.ts";
import { createInMemoryBlobStore } from "./in-memory-blob-store.ts";
import { createInMemoryJobQueue } from "./in-memory-job-queue.ts";
import { createInMemoryNotifier } from "./in-memory-notifier.ts";
import { createFakeScheduler } from "./in-memory-scheduler.ts";
import { createInMemorySecretStore } from "./in-memory-secret-store.ts";
import { createInMemorySettingsStore } from "./in-memory-settings-store.ts";
import { createInMemoryUnitOfWork } from "./in-memory-store.ts";
import { jobQueueContract } from "./job-queue-contract.ts";
import { mailProviderContract } from "./mail-provider-contract.ts";
import { notifierContract } from "./notifier-contract.ts";
import { platformContract } from "./platform-contract.ts";
import { powerMonitorContract } from "./power-monitor-contract.ts";
import { repositoriesContract } from "./repositories-contract.ts";
import { schedulerContract } from "./scheduler-contract.ts";
import { secretStoreContract } from "./secret-store-contract.ts";
import { settingsStoreContract } from "./settings-store-contract.ts";
import { signalRepositoryContract } from "./signal-repository-contract.ts";
import { unitOfWorkContract } from "./unit-of-work-contract.ts";

// Every in-memory adapter must pass its own contract suite.
unitOfWorkContract(createInMemoryUnitOfWork);
repositoriesContract(createInMemoryUnitOfWork);
signalRepositoryContract(createInMemoryUnitOfWork);
digestStateContract(createInMemoryUnitOfWork);
blobStoreContract(createInMemoryBlobStore);
secretStoreContract(createInMemorySecretStore);
settingsStoreContract(createInMemorySettingsStore);
jobQueueContract(() => {
  const clock = createFakeClock();
  return { queue: createInMemoryJobQueue(clock), clock };
});
schedulerContract(() => {
  const scheduler = createFakeScheduler(createFakeClock());
  return { scheduler, advance: (ms) => scheduler.advance(ms) };
});
notifierContract(() => {
  const notifier = createInMemoryNotifier();
  return { notifier, shown: () => notifier.sent() };
});
powerMonitorContract(() => {
  const monitor = createFakePowerMonitor();
  return { monitor, change: (c) => monitor.set(c) };
});
platformContract(() => createFakePlatform({ os: "macos" }));
platformContract(() => createFakePlatform({ os: "windows" }));
platformContract(() => createFakePlatform({ os: "linux" }));
classifierContract(createFakeClassifier);
embedderContract(() => createFakeEmbedder(8));
llmProviderContract(createFakeLlmProvider);
mailProviderContract(() => {
  const provider = createFakeMailProvider({ pageSize: 2 });
  return { provider, deliver: (...m) => provider.deliver(...m) };
});
exporterContract(createFakeExporter);

describe("controllable fakes", () => {
  const live = () => new AbortController().signal;

  it("the mail provider fails with Offline on demand and recovers (guards untested offline handling)", async () => {
    const provider = createFakeMailProvider();
    provider.simulateOffline();
    const r = await provider.sync(null, live());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(Offline);
    provider.faults.clear();
    expect((await provider.sync(null, live())).ok).toBe(true);
  });

  it("the mail provider fails with RateLimited and its retry-after on demand (guards untested backoff)", async () => {
    const provider = createFakeMailProvider();
    provider.simulateRateLimit(2500);
    const r = await provider.applyCommands([], live());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(RateLimited);
      expect((r.error as RateLimited).retryAfterMs).toBe(2500);
    }
  });

  it("a fault with times: 1 fails one call and then clears itself (guards tests that must retry once)", async () => {
    const provider = createFakeMailProvider();
    provider.faults.failWith(new Offline(), { times: 1 });
    expect((await provider.sync(null, live())).ok).toBe(false);
    expect((await provider.sync(null, live())).ok).toBe(true);
  });

  it("a forced storage failure inside a transaction leaves no rows or events (guards partial writes under failure)", async () => {
    const store = createInMemoryUnitOfWork();
    const ws = "ws-1" as WorkspaceId;
    const r = await store.uow.run(async (tx) => {
      const saved = await tx.repositories.topics.save({
        schemaVersion: 1,
        id: "t-1" as never,
        workspaceId: ws,
        name: "Trips",
      });
      expect(saved.ok).toBe(true);
      store.faults.failWith(new StorageError("disk full"), { times: 1 });
      return tx.outbox.append({ kind: "event", event: { id: "e1", type: "x", workspaceId: ws } });
    });
    expect(r.ok).toBe(false);
    expect(await store.uow.reads.topics.list(ws)).toEqual(ok([]));
    expect(await store.committedOutbox()).toEqual([]);
  });

  it("the classifier reports AiUnavailable on demand (guards untested model-missing handling)", async () => {
    const classifier = createFakeClassifier();
    classifier.makeUnavailable();
    const r = await classifier.classify([], live());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ai.unavailable");
  });

  it("a fake scheduler runs nothing until time is advanced (guards flaky sleep-based tests)", async () => {
    const clock = createFakeClock();
    const scheduler = createFakeScheduler(clock);
    let ran = false;
    scheduler.after(60_000, async () => {
      ran = true;
    });
    expect(ran).toBe(false);
    await scheduler.advance(60_000);
    expect(ran).toBe(true);
    expect(clock.now().getTime() - new Date("2026-01-01T00:00:00.000Z").getTime()).toBe(60_000);
  });

  it("the power monitor tells listeners about going offline (guards ignoring the offline state)", () => {
    const monitor = createFakePowerMonitor();
    const seen: boolean[] = [];
    monitor.onChange((s) => void seen.push(s.online));
    monitor.goOffline();
    monitor.goOffline();
    expect(seen).toEqual([false]);
  });
});
