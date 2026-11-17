import type { Topic } from "@pochimail/core/domain/mail";
import { Cancelled } from "@pochimail/core/errors";
import type { WriteRepositories } from "@pochimail/core/ports/repositories";
import type { UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { err, ok } from "@pochimail/core/result";
import { createFakeClock } from "./fake-clock.ts";
import { createInMemoryOutbox } from "./in-memory-outbox.ts";
import { createLeasedJobQueue } from "./leased-job-queue.ts";
import { runJobQueueContract } from "./leased-job-queue-contract.ts";
import { runOutboxContract } from "./outbox-contract.ts";

runJobQueueContract(() => {
  const clock = createFakeClock();
  const leaseMs = 10_000;
  const queue = createLeasedJobQueue(clock, { leaseMs });
  return {
    queue,
    clock,
    leaseMs,
    deadLetters: async () => queue.deadLetters(),
  };
});

// Minimal transactional store: topics + the in-memory outbox commit or roll back together.
runOutboxContract(() => {
  const outbox = createInMemoryOutbox();
  let topics: Topic[] = [];
  const clock = createFakeClock();
  const topicReads = { list: async () => ok(topics.slice()) };
  const run: UnitOfWork["run"] = async (work, signal) => {
    if (signal?.aborted) return err(new Cancelled());
    const staging = outbox.begin();
    const draft = topics.slice();
    try {
      const r = await work({
        repositories: {
          topics: {
            ...topicReads,
            save: async (t: Topic) => {
              draft.push(t);
              return ok(undefined);
            },
          },
        } as unknown as WriteRepositories,
        outbox: staging.writer,
      });
      if (r.ok) {
        topics = draft;
        staging.commit();
      } else staging.discard();
      return r;
    } catch (e) {
      staging.discard();
      throw e;
    }
  };
  const uow = { reads: { topics: topicReads }, run } as unknown as UnitOfWork;
  return { uow, store: outbox.store, queue: createLeasedJobQueue(clock) };
});
