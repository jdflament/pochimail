import { createFakeClock } from "./fake-clock.ts";
import { createInMemoryJobQueue } from "./in-memory-job-queue.ts";
import { createInMemoryUnitOfWork } from "./in-memory-store.ts";
import { runJobQueueContract } from "./job-queue-lease-contract.ts";
import { runOutboxContract } from "./outbox-contract.ts";

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
