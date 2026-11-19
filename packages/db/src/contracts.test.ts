import type { Category } from "@pochimail/core/domain/category";
import { AiUnavailable, type ProviderError } from "@pochimail/core/errors";
import { derivedContract } from "@pochimail/testing/derived-contract";
import { digestStateContract } from "@pochimail/testing/digest-state-contract";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import { createGroundTruthClassifier } from "@pochimail/testing/ground-truth-classifier";
import { createInMemorySecretStore } from "@pochimail/testing/in-memory-secret-store";
import { insightContract } from "@pochimail/testing/insight-contract";
import { repositoriesContract } from "@pochimail/testing/repositories-contract";
import { signalRepositoryContract } from "@pochimail/testing/signal-repository-contract";
import { runSyncContract } from "@pochimail/testing/sync-contract";
import { harness, uowHarness } from "./test-support/harness.ts";

// Every exported repository contract suite, unchanged, against SQLite (none skipped).
repositoriesContract(uowHarness);
derivedContract(uowHarness);
signalRepositoryContract(uowHarness);
digestStateContract(uowHarness);
insightContract(() => {
  const h = harness();
  const labels = new Map<string, Category>();
  return {
    uow: h.uow,
    clock: createFakeClock(),
    classifier: createGroundTruthClassifier(labels),
    labels,
    snapshot: h.snapshot,
  };
});
runSyncContract(() => {
  const h = harness();
  const provider = createFakeMailProvider({ pageSize: 2 });
  const labels = new Map<string, Category>();
  const classifier = createGroundTruthClassifier(labels);
  let next = 0;
  return {
    uow: h.uow,
    secrets: createInMemorySecretStore(),
    provider,
    clock: createFakeClock(),
    ids: { next: (prefix: string) => `${prefix}_${++next}` },
    labels,
    classifier,
    makeClassifierUnavailable: () => classifier.faults.failWith(new AiUnavailable(), { times: 1 }),
    deliver: provider.deliver,
    setBody: provider.setBody,
    failNextSync: (error: ProviderError) => provider.faults.failWith(error, { times: 1 }),
    snapshot: h.snapshot,
    committedOutbox: h.committedOutbox,
  };
});
