import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The slice of Electron's async `safeStorage` we use (the sync calls are deprecated); injectable so the key policy is testable without Electron. */
export type KeyVault = {
  isAsyncEncryptionAvailable: () => Promise<boolean>;
  encryptStringAsync: (plain: string) => Promise<Buffer>;
  decryptStringAsync: (cipher: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>;
  /** Linux only: "basic_text", "gnome_libsecret", "kwallet5", ... */
  getSelectedStorageBackend?: () => string;
};

export type KeyProtection =
  | { level: "os-keychain"; backend: string }
  | { level: "basic-text" }
  | { level: "unavailable" };

/** Linux without a secret service falls back to a hard-coded password: that is obfuscation, not a secret (ADR 0005). */
export const keyProtection = async (
  vault: KeyVault,
  platform: NodeJS.Platform,
): Promise<KeyProtection> => {
  if (!(await vault.isAsyncEncryptionAvailable())) return { level: "unavailable" };
  if (platform !== "linux")
    return { level: "os-keychain", backend: platform === "darwin" ? "keychain" : "dpapi" };
  const backend = vault.getSelectedStorageBackend?.() ?? "unknown";
  return backend === "basic_text" || backend === "unknown"
    ? { level: "basic-text" }
    : { level: "os-keychain", backend };
};

/**
 * Returns the 256-bit database key, creating it on first launch. It is only ever written wrapped by the OS keychain.
 * Returns undefined when the keychain cannot protect it: the caller must warn and ask first (ADR 0005).
 */
export const loadOrCreateDatabaseKey = async (
  vault: KeyVault,
  keyFile: string,
  platform: NodeJS.Platform,
): Promise<Buffer | undefined> => {
  if ((await keyProtection(vault, platform)).level !== "os-keychain") return undefined;
  if (existsSync(keyFile)) {
    const { result, shouldReEncrypt } = await vault.decryptStringAsync(readFileSync(keyFile));
    if (shouldReEncrypt)
      writeFileSync(keyFile, await vault.encryptStringAsync(result), { mode: 0o600 });
    return Buffer.from(result, "hex");
  }
  const key = randomBytes(32);
  writeFileSync(keyFile, await vault.encryptStringAsync(key.toString("hex")), { mode: 0o600 });
  return key;
};
