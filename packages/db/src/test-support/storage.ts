import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EventEnvelope } from "@pochimail/kernel/event";
import type { WorkspaceId } from "@pochimail/kernel/ids";
import { ok, unwrap } from "@pochimail/kernel/result";
import type { EventBus } from "@pochimail/pipeline/event-bus";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { afterEach } from "vitest";
import { openStorage, type Storage } from "../open-storage.ts";
import { createSqliteJobQueue } from "../sqlite-job-queue.ts";
import { createSqliteUnitOfWork } from "../sqlite-unit-of-work.ts";

const dirs: string[] = [];
export const opened: Storage[] = [];
export const key = (n: number) => Buffer.alloc(32, n);
export const freshPath = () => {
  const dir = mkdtempSync(join(tmpdir(), "pochimail-db-"));
  dirs.push(dir);
  return join(dir, "pochimail.db");
};
export function open(path = freshPath(), k = key(1)) {
  const storage = unwrap(openStorage(path, k));
  opened.push(storage);
  return storage;
}
afterEach(() => {
  for (const s of opened.splice(0)) {
    try {
      s.close();
    } catch {
      // already closed by the test
    }
  }
  for (const d of dirs.splice(0))
    rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

export function sqliteUnitOfWorkHarness() {
  const { uow, outboxStore } = createSqliteUnitOfWork(open());
  return {
    uow,
    committedOutbox: async () => unwrap(await outboxStore.pending(1000)).map((r) => r.entry),
  };
}
export const queueHarness = (leaseMs = 10_000) => {
  const storage = open();
  const clock = createFakeClock();
  const queue = createSqliteJobQueue(storage, clock, { leaseMs });
  return { storage, clock, queue, leaseMs };
};

export const ws = "w-1" as WorkspaceId;
export const recordingBus = () => {
  const published: string[] = [];
  const bus: EventBus<EventEnvelope> = {
    async publish(e) {
      published.push(e.id);
      return ok(undefined);
    },
    subscribe: () => () => {},
  };
  return { bus, published };
};
