import { existsSync, readFileSync } from "node:fs";
import type { Logger } from "@pochimail/core/logger";
import { err, ok, type Result } from "@pochimail/core/result";
import { SecretStoreError } from "../shared/secret-error.ts";
import { writeFileAtomic } from "./atomic-write.ts";
import { type KeyProtection, type KeyVault, keyProtection } from "./storage-key.ts";

export type SecretVault = {
  get: (key: string) => Promise<Result<string | null, SecretStoreError>>;
  set: (key: string, value: string) => Promise<Result<void, SecretStoreError>>;
  remove: (key: string) => Promise<Result<void, SecretStoreError>>;
  /** What the OS can do for us right now; onboarding (M4-20) reads it to ask the user about `basic-text`. */
  protection: () => Promise<KeyProtection>;
};

type Entries = Record<string, string>;

/**
 * Main-process owner of the secrets file. Each value is wrapped by the OS keychain (async `safeStorage`) before it
 * touches the disk. `basic-text` (Linux without a secret service) stores nothing unless `allowBasicText()` says the
 * user chose it; with `unavailable` nothing is ever written. Values never reach a log or an error.
 */
export const createSecretVault = (options: {
  vault: KeyVault;
  file: string;
  platform: NodeJS.Platform;
  allowBasicText?: () => boolean;
  logger?: Logger;
}): SecretVault => {
  const { vault, file, platform, logger } = options;
  const allowBasicText = options.allowBasicText ?? (() => false);
  // Reads and writes are serialized so two concurrent `set` calls never lose one another's entry.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };
  const fail = (operation: string, error: SecretStoreError): Result<never, SecretStoreError> => {
    logger?.warn(`secret store ${operation} failed (${error.reason.replaceAll("-", " ")})`, {
      code: "storage.failed",
    });
    return err(error);
  };

  const load = (): Entries | undefined => {
    if (!existsSync(file)) return {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (typeof parsed !== "object" || parsed === null) return undefined;
      const entries = (parsed as { entries?: unknown }).entries;
      if (typeof entries !== "object" || entries === null) return undefined;
      const result: Entries = {};
      for (const [name, wrapped] of Object.entries(entries)) {
        if (typeof wrapped !== "string") return undefined;
        result[name] = wrapped;
      }
      return result;
    } catch {
      return undefined;
    }
  };
  const save = (entries: Entries): void =>
    writeFileAtomic(file, JSON.stringify({ version: 1, entries }));
  const mayWrap = async (): Promise<boolean> => {
    const level = (await keyProtection(vault, platform)).level;
    return level === "os-keychain" || (level === "basic-text" && allowBasicText());
  };

  return {
    protection: () => keyProtection(vault, platform),
    get: (key) =>
      serial(async () => {
        const entries = load();
        if (entries === undefined) return fail("get", new SecretStoreError("corrupted"));
        const wrapped = entries[key];
        if (wrapped === undefined) return ok(null);
        if ((await keyProtection(vault, platform)).level === "unavailable")
          return fail("get", new SecretStoreError("protection-unavailable"));
        try {
          const { result, shouldReEncrypt } = await vault.decryptStringAsync(
            Buffer.from(wrapped, "base64"),
          );
          // Re-wrapping is a write: it follows the same consent gate as `set` (basic_text needs the user's choice).
          if (shouldReEncrypt && (await mayWrap())) {
            entries[key] = (await vault.encryptStringAsync(result)).toString("base64");
            save(entries);
          }
          return ok(result);
        } catch {
          return fail("get", new SecretStoreError("corrupted"));
        }
      }),
    set: (key, value) =>
      serial(async () => {
        if (!(await mayWrap())) return fail("set", new SecretStoreError("protection-unavailable"));
        const entries = load();
        if (entries === undefined) return fail("set", new SecretStoreError("corrupted"));
        try {
          entries[key] = (await vault.encryptStringAsync(value)).toString("base64");
          save(entries);
          return ok(undefined);
        } catch {
          return fail("set", new SecretStoreError("failed"));
        }
      }),
    remove: (key) =>
      serial(async () => {
        const entries = load();
        if (entries === undefined) return fail("remove", new SecretStoreError("corrupted"));
        if (!(key in entries)) return ok(undefined);
        try {
          delete entries[key];
          save(entries);
          return ok(undefined);
        } catch {
          return fail("remove", new SecretStoreError("failed"));
        }
      }),
  };
};
