import type { Topic } from "@pochimail/core/domain/mail";
import { Cancelled } from "@pochimail/core/errors";
import type { WriteRepositories } from "@pochimail/core/ports/repositories";
import type { OutboxEntry, UnitOfWork } from "@pochimail/core/ports/unit-of-work";
import { err, ok } from "@pochimail/core/result";
import { type UnitOfWorkHarness, unitOfWorkContract } from "./unit-of-work-contract.ts";

// A deliberately tiny snapshot/restore stand-in, only to prove the contract suite itself can
// fail and pass. The real in-memory adapter is M1-09.
function makeHarness(): UnitOfWorkHarness {
  let topics: Topic[] = [];
  let outbox: OutboxEntry[] = [];
  const topicRepo = (target: () => Topic[]) => ({
    list: async () => ok(target().slice()),
    save: async (t: Topic) => {
      target().push(t);
      return ok(undefined);
    },
  });
  const run: UnitOfWork["run"] = async (work, signal) => {
    if (signal?.aborted) return err(new Cancelled());
    const before = { topics: topics.slice(), outbox: outbox.slice() };
    try {
      const r = await work({
        repositories: { topics: topicRepo(() => topics) } as unknown as WriteRepositories,
        outbox: {
          append: async (e) => {
            outbox.push(e);
            return ok(undefined);
          },
        },
      });
      const final = signal?.aborted ? err(new Cancelled()) : r;
      if (!final.ok) throw Object.assign(new Error("rollback"), { result: final });
      return r;
    } catch (e: unknown) {
      topics = before.topics;
      outbox = before.outbox;
      if (e instanceof Error && "result" in e) return e.result as never;
      throw e;
    }
  };
  const uow = { reads: { topics: topicRepo(() => topics) }, run } as unknown as UnitOfWork;
  return { uow, committedOutbox: async () => outbox };
}

unitOfWorkContract(makeHarness);
