import { StorageError } from "@pochimail/core/errors";
import type { OutboxRecord, OutboxStore } from "@pochimail/core/ports/outbox";
import type { OutboxEntry, OutboxWriter } from "@pochimail/core/ports/unit-of-work";
import { ok } from "@pochimail/core/result";

export interface OutboxStaging {
  /** The transaction's writer: appends are invisible to the store until `commit`. */
  readonly writer: OutboxWriter;
  commit(): void;
  discard(): void;
}

export interface InMemoryOutbox {
  readonly store: OutboxStore;
  /** Starts one transaction's worth of appends. */
  begin(): OutboxStaging;
}

/** In-memory transactional outbox: staged appends become pending rows only on `commit`. */
export function createInMemoryOutbox(): InMemoryOutbox {
  const rows: { id: string; entry: OutboxEntry; delivered: boolean }[] = [];
  let seq = 0;
  return {
    store: {
      async pending(limit) {
        const out: OutboxRecord[] = rows
          .filter((r) => !r.delivered)
          .slice(0, limit)
          .map((r) => structuredClone({ id: r.id, entry: r.entry }));
        return ok(out);
      },
      async markDelivered(id) {
        const row = rows.find((r) => r.id === id);
        if (!row) return { ok: false, error: new StorageError("Outbox row not found") };
        row.delivered = true;
        return ok(undefined);
      },
    },
    begin() {
      const staged: OutboxEntry[] = [];
      return {
        writer: {
          async append(entry) {
            staged.push(structuredClone(entry));
            return ok(undefined);
          },
        },
        commit() {
          for (const entry of staged) {
            seq += 1;
            rows.push({ id: `ob-${seq}`, entry, delivered: false });
          }
          staged.length = 0;
        },
        discard() {
          staged.length = 0;
        },
      };
    },
  };
}
