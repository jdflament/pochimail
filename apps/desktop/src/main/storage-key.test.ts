import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type KeyVault, keyProtection, loadOrCreateDatabaseKey } from "./storage-key.ts";

/** Reversible stand-in for the OS keychain: the "ciphertext" visibly differs from the plaintext. */
const fakeVault = (overrides: Partial<KeyVault> = {}): KeyVault => ({
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (plain) => Buffer.from(`wrapped:${plain}`),
  decryptStringAsync: async (cipher) => ({
    result: cipher.toString().replace("wrapped:", ""),
    shouldReEncrypt: false,
  }),
  ...overrides,
});
const keyFile = () => join(mkdtempSync(join(tmpdir(), "pochimail-key-")), "db.key");

describe("database key", () => {
  // Guards: the raw key landing in a file, or a new key on every launch (which would lock the user out of their data).
  it("is stored wrapped, and the same key comes back on the next launch", async () => {
    const file = keyFile();
    const first = await loadOrCreateDatabaseKey(fakeVault(), file, "darwin");
    expect(first).toHaveLength(32);
    const stored = readFileSync(file);
    expect(stored.toString().startsWith("wrapped:")).toBe(true);
    expect(stored.includes(first ?? Buffer.alloc(0))).toBe(false); // the raw 32 bytes are not in the file
    expect(await loadOrCreateDatabaseKey(fakeVault(), file, "darwin")).toEqual(first);
  });

  // Guards: silently writing the key under Linux's hard-coded basic_text password; the app must ask the user first.
  it("refuses to store the key when Linux falls back to basic_text", async () => {
    const vault = fakeVault({ getSelectedStorageBackend: () => "basic_text" });
    expect(await keyProtection(vault, "linux")).toEqual({ level: "basic-text" });
    const file = keyFile();
    expect(await loadOrCreateDatabaseKey(vault, file, "linux")).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });

  it("accepts a real Linux secret service", async () => {
    const vault = fakeVault({ getSelectedStorageBackend: () => "gnome_libsecret" });
    expect(await keyProtection(vault, "linux")).toEqual({
      level: "os-keychain",
      backend: "gnome_libsecret",
    });
  });

  it("reports an unavailable keychain", async () => {
    const vault = fakeVault({ isAsyncEncryptionAvailable: async () => false });
    expect(await loadOrCreateDatabaseKey(vault, keyFile(), "win32")).toBeUndefined();
  });
});
