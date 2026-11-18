import { derivedContract } from "./derived-contract.ts";
import { createFakeClock } from "./fake-clock.ts";
import { createGroundTruthClassifier } from "./ground-truth-classifier.ts";
import { createInMemoryUnitOfWork } from "./in-memory-store.ts";
import { insightContract } from "./insight-contract.ts";

derivedContract(() => {
  const store = createInMemoryUnitOfWork();
  return { uow: store.uow, committedOutbox: store.committedOutbox };
});

insightContract(() => {
  const store = createInMemoryUnitOfWork();
  const labels = new Map();
  return {
    uow: store.uow,
    clock: createFakeClock(),
    classifier: createGroundTruthClassifier(labels),
    labels,
    snapshot: store.snapshot,
  };
});
