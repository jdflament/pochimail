import { accountRepositoryContract } from "@pochimail/accounts/testing/account-repository-contract";
import { createInMemorySecretStore } from "@pochimail/accounts/testing/in-memory-secret-store";
import type { Category } from "@pochimail/core/domain/category";
import { AiUnavailable } from "@pochimail/core/errors";
import type { ProviderError } from "@pochimail/kernel/errors";
import { mailboxRepositoryContract } from "@pochimail/mailbox/testing/mailbox-repository-contract";
import { derivedContract } from "@pochimail/testing/derived-contract";
import { digestStateContract } from "@pochimail/testing/digest-state-contract";
import { createFakeClock } from "@pochimail/testing/fake-clock";
import { createFakeMailProvider } from "@pochimail/testing/fake-mail-provider";
import { createGroundTruthClassifier } from "@pochimail/testing/ground-truth-classifier";
import { insightContract } from "@pochimail/testing/insight-contract";
import { repositoriesContract } from "@pochimail/testing/repositories-contract";
import { signalRepositoryContract } from "@pochimail/testing/signal-repository-contract";
import { runSyncContract } from "@pochimail/testing/sync-contract";
import { harness, uowHarness } from "./test-support/harness.ts";

// The domain packages' own repository contracts, then every exported contract suite, unchanged, against SQLite (none skipped).
accountRepositoryContract(uowHarness);
mailboxRepositoryContract(uowHarness);
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
