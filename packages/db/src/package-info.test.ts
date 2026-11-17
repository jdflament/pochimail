import { packageName } from "@pochimail/db/package-info";
import { expect, it } from "vitest";

// Guards: the package's `exports` map resolves to real source through its public name.
it("is importable through its public exports entry", () => {
  expect(packageName).toBe("@pochimail/db");
});
