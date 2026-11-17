import type { StorageError } from "@pochimail/core/errors";
import type { Notification, Notifier } from "@pochimail/core/ports/notifier";
import { err, ok } from "@pochimail/core/result";
import { createFaults, type Faults } from "./faults.ts";

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
