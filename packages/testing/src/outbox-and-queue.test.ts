import { StorageError } from "@pochimail/kernel/errors";
import { err } from "@pochimail/kernel/result";
import { createFakeClock } from "./fake-clock.ts";
import { createInMemoryJobQueue } from "./in-memory-job-queue.ts";
import { createInMemoryUnitOfWork } from "./in-memory-store.ts";
import { runJobQueueContract } from "./job-queue-lease-contract.ts";
import { runOutboxContract } from "./outbox-contract.ts";
import { runPipelineContract } from "./pipeline-contract.ts";

runJobQueueContract(() => {
  const clock = createFakeClock();
  const leaseMs = 10_000;
  const queue = createInMemoryJobQueue(clock, { leaseMs });
  return {
    queue,
    clock,
    leaseMs,
    deadLetters: async () => queue.deadLetters().map((d) => ({ jobId: d.job.id, code: d.code })),
  };
});

runOutboxContract(() => {
  const { uow, outboxStore } = createInMemoryUnitOfWork();
  return { uow, store: outboxStore, queue: createInMemoryJobQueue(createFakeClock()) };
});

runPipelineContract(() => {
  const clock = createFakeClock();
  const { uow } = createInMemoryUnitOfWork();
  const queue = createInMemoryJobQueue(clock);
  return {
    queue,
    clock,
    cursors: {
      get: uow.reads.cursors.get,
      set: async (w, a, c) => {
        const r = await uow.run(async (tx) => tx.repositories.cursors.set(w, a, c));
        return r.ok ? r : err(new StorageError());
      },
    },
    deadLetters: async () => queue.deadLetters().map((d) => ({ jobId: d.job.id })),
  };
});
