import { expect, it } from "vitest";
import { packageName } from "@pochimail/testing/package-info";

// Guards: the package's `exports` map resolves to real source through its public name.
it("is importable through its public exports entry", () => {
  expect(packageName).toBe("@pochimail/testing");
});
