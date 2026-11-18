import type { Logger } from "@pochimail/core/logger";
import type { Result } from "@pochimail/core/result";
import type { MessageChannelMain, MessagePortMain } from "electron";
import { serveSecrets } from "../shared/ipc/secrets.ts";
import type { SecretVault } from "./secret-vault.ts";
import type { DatabaseKeyError } from "./storage-key.ts";

/**
 * Hands the worker what only main can produce: the database key and a private port to the keychain service.
 * The port goes to the worker alone, never to a WebContents. Without a key (no keychain, no user choice yet) the
 * worker starts without one and must not open the database.
 */
export const startWorker = (
  worker: { postMessage: (message: unknown, transfer: MessagePortMain[]) => void },
  secrets: SecretVault,
  databaseKey: Buffer | undefined,
  createChannel: () => Pick<MessageChannelMain, "port1" | "port2">,
): void => {
  const { port1, port2 } = createChannel();
  serveSecrets(
    {
      post: (message) => port1.postMessage(message),
      onMessage: (handler) => port1.on("message", (event) => handler(event.data)),
    },
    secrets,
  );
  port1.start();
  worker.postMessage(
    {
      type: "start",
      ...(databaseKey === undefined ? {} : { databaseKeyHex: databaseKey.toString("hex") }),
    },
    [port2],
  );
};

/**
 * Loads the database key, then starts the worker. If the key cannot be produced the worker is NOT started (it is
 * killed): failing loudly beats running keyless or on a fresh key. The failure is logged by reason only.
 */
export const bootWorker = async (options: {
  worker: {
    postMessage: (message: unknown, transfer: MessagePortMain[]) => void;
    kill: () => void;
  };
  secrets: SecretVault;
  loadKey: () => Promise<Result<Buffer | undefined, DatabaseKeyError>>;
  createChannel: () => Pick<MessageChannelMain, "port1" | "port2">;
  logger: Logger;
}): Promise<boolean> => {
  const { worker, secrets, loadKey, createChannel, logger } = options;
  const key = await loadKey().catch(() => undefined);
  if (key === undefined || !key.ok) {
    // The reason is part of the fixed message (the logger redacts free-form field values).
    const reason = (key?.ok === false ? key.error.reason : "unexpected").replaceAll("-", " ");
    logger.error(`database key unavailable (${reason}), worker not started`, {
      operation: "start",
      code: "storage.failed",
    });
    worker.kill();
    return false;
  }
  startWorker(worker, secrets, key.value, createChannel);
  return true;
};
