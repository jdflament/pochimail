import { createLogger } from "@pochimail/core/logger";
import { expect, it } from "vitest";

// The full leak contract runs in packages/testing (core cannot depend on it without a cycle).
// Guards: a logger built with only a sink must not be able to emit raw fields.
it("has no option that disables redaction", () => {
  const records: unknown[] = [];
  // @ts-expect-error redaction cannot be switched off
  const logger = createLogger({ sink: { write: (r) => records.push(r) }, redact: false });
  logger.info("x", { subject: "secret subject" });
  expect(JSON.stringify(records)).not.toMatch(/secret subject/);
});
