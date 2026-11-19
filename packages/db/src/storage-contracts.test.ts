import { StorageError } from "@pochimail/kernel/errors";
import { err } from "@pochimail/kernel/result";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { jobQueueContract } from "@pochimail/testing/job-queue-contract";
import { runJobQueueContract } from "@pochimail/testing/job-queue-lease-contract";
import { runOutboxContract } from "@pochimail/testing/outbox-contract";
import { runPipelineContract } from "@pochimail/testing/pipeline-contract";
import { unitOfWorkContract } from "@pochimail/testing/unit-of-work-contract";
import { createSqliteJobQueue } from "./sqlite-job-queue.ts";
import { createSqliteUnitOfWork } from "./sqlite-unit-of-work.ts";
import { open, queueHarness, sqliteUnitOfWorkHarness } from "./test-support/storage.ts";

unitOfWorkContract(sqliteUnitOfWorkHarness);
jobQueueContract(() => queueHarness());
runJobQueueContract(() => {
  const h = queueHarness();
  return { ...h, deadLetters: async () => h.queue.deadLetters() };
});
runOutboxContract(() => {
  const storage = open();
  const { uow, outboxStore } = createSqliteUnitOfWork(storage);
  return { uow, store: outboxStore, queue: createSqliteJobQueue(storage, createFakeClock()) };
});

runPipelineContract(() => {
  const h = queueHarness();
  const { uow } = createSqliteUnitOfWork(h.storage);
  return {
    queue: h.queue,
    clock: h.clock,
    cursors: {
      get: uow.reads.cursors.get,
      set: async (w, a, c) => {
        const r = await uow.run(async (tx) => tx.repositories.cursors.set(w, a, c));
        return r.ok ? r : err(new StorageError());
      },
    },
    deadLetters: async () => h.queue.deadLetters().map((d) => ({ jobId: d.jobId })),
  };
});

// The repository contracts (all of them, none skipped) run in sqlite-repositories.test.ts.
