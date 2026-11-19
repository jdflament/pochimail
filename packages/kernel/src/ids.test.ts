import { expect, it } from "vitest";
import { isLogSafeId, WorkspaceId } from "./ids.ts";

// Guards: padded, empty or control-character ids slipping into ports and log lines.
it.each(["", " a", "a ", "a\nb", "x".repeat(513)])("rejects invalid workspace id %j", (raw) => {
  const result = WorkspaceId(raw);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("domain.invalid_id");
});

// Guards: a provider-style opaque id passing the log-safe check and reaching a log line.
it("treats only our own prefixed ULID ids as log-safe", () => {
  expect(isLogSafeId("msg_01HZX3K9Q7M2V8N4P5R6S7T8W9")).toBe(true);
  expect(isLogSafeId("AAMkAGI2THVSAAA=")).toBe(false);
});
