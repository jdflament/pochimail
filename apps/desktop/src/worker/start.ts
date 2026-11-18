import type { SecretStore } from "@pochimail/core/ports/secret-store";
import { z } from "zod";
import { createSecretsClient, type ProtectionState } from "../shared/ipc/secrets.ts";

const startSchema = z.object({ type: z.literal("start"), databaseKeyHex: z.string().optional() });

export type WorkerStart = {
  /** Undefined when main could not protect a key; the worker must not open the database then. */
  databaseKey: Buffer | undefined;
  secrets: SecretStore & { protection: () => Promise<ProtectionState> };
};

type SecretsPort = {
  postMessage: (message: unknown) => void;
  on: (event: "message", listener: (event: { data: unknown }) => void) => void;
  start: () => void;
};

/** Adapter: a `SecretStore` whose every call is answered by the main process (the only place `safeStorage` works). */
const createWorkerSecretStore = (port: SecretsPort, timeoutMs?: number) => {
  const client = createSecretsClient(
    {
      post: (message) => port.postMessage(message),
      onMessage: (handler) => port.on("message", (event) => handler(event.data)),
    },
    timeoutMs,
  );
  port.start();
  return client;
};

/** Receives main's `start` message (the only message that carries the secrets port). */
export const acceptStart = (
  parent: {
    on: (
      event: "message",
      listener: (event: { data: unknown; ports: SecretsPort[] }) => void,
    ) => void;
  },
  onStart: (start: WorkerStart) => void,
): void => {
  parent.on("message", (event) => {
    const parsed = startSchema.safeParse(event.data);
    const port = event.ports[0];
    if (!parsed.success || port === undefined) return;
    onStart({
      databaseKey:
        parsed.data.databaseKeyHex === undefined
          ? undefined
          : Buffer.from(parsed.data.databaseKeyHex, "hex"),
      secrets: createWorkerSecretStore(port),
    });
  });
};
