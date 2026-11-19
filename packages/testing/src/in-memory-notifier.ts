import type { Notification, Notifier } from "@pochimail/core/ports/notifier";
import type { StorageError } from "@pochimail/kernel/errors";
import { err, ok } from "@pochimail/kernel/result";
import { createFaults, type Faults } from "@pochimail/kernel/testing/faults";

export interface InMemoryNotifier extends Notifier {
  readonly faults: Faults<StorageError>;
  /** Everything shown so far, in order. */
  sent(): readonly Notification[];
}

export function createInMemoryNotifier(): InMemoryNotifier {
  const sent: Notification[] = [];
  const faults = createFaults<StorageError>();
  return {
    faults,
    sent: () => sent.slice(),
    async notify(notification) {
      const failure = faults.take();
      if (failure) return err(failure);
      sent.push({ ...notification });
      return ok(undefined);
    },
  };
}
