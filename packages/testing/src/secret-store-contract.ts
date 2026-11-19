import type { SecretStore } from "@pochimail/core/ports/secret-store";
import { ok, unwrap } from "@pochimail/kernel/result";
import { expect } from "vitest";
import { type Check, check, registerContract } from "./contract.ts";

export const secretStoreChecks: readonly Check<SecretStore>[] = [
  check(
    "a missing secret is null, not an error (guards treating first run as a failure)",
    async (s) => {
      expect(await s.get("refresh-token")).toEqual(ok(null));
    },
  ),
  check(
    "set then get returns the value, and set overwrites (guards a stale token after refresh)",
    async (s) => {
      await s.set("refresh-token", "one");
      expect(unwrap(await s.get("refresh-token"))).toBe("one");
      await s.set("refresh-token", "two");
      expect(unwrap(await s.get("refresh-token"))).toBe("two");
    },
  ),
  check(
    "remove deletes only that key and is harmless twice (guards sign-out leaving a token or wiping others)",
    async (s) => {
      await s.set("a", "1");
      await s.set("b", "2");
      expect((await s.remove("a")).ok).toBe(true);
      expect((await s.remove("a")).ok).toBe(true);
      expect(unwrap(await s.get("a"))).toBeNull();
      expect(unwrap(await s.get("b"))).toBe("2");
    },
  ),
];

/** Contract for any `SecretStore`. `make` returns a fresh, empty store. */
export function secretStoreContract(make: () => SecretStore | Promise<SecretStore>): void {
  registerContract("SecretStore contract", secretStoreChecks, make);
}
