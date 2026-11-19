import { ERROR_CODES } from "@pochimail/kernel/errors";
import { isLogSafeId } from "@pochimail/kernel/ids";

export const REDACTED = "[redacted]";

// Allow-list with VALUE validation. A safe key does not let any string through: the value must
// also have the key's shape, otherwise it is redacted ("Jane Doe" under `subjectId` leaks nothing).
export type Shape = "id" | "enum" | "number" | "http" | "code";

export function shapeOf(key: string): Shape | null {
  if (/^(?:id|ids|[a-z][a-zA-Z0-9]*Ids?)$/.test(key)) return "id";
  // Numbers are only inert under this allow-list; under any other key (pin, phoneNumber) they leak.
  if (
    /^(?:count|total|size|bytes|attempts?|retries|index|limit|offset|percent|[a-z][a-zA-Z0-9]*(?:Count|Ms|Bytes))$/.test(
      key,
    )
  ) {
    return "number";
  }
  if (key === "status" || key === "httpStatus") return "http";
  if (key === "code") return "code";
  if (/^(?:kind|type|state|phase|status|provider|operation|level)$/.test(key)) return "enum";
  return null;
}

// IDs: only our strict `<prefix>_<ULID|UUID>` shape (ids.ts). Codes: only the closed ERROR_CODES set.
export const CODES: ReadonlySet<string> = new Set(ERROR_CODES);

// Closed vocabulary for enum-like keys. A value outside it is logged as [redacted]; add words here.
const ENUM_VALUES: ReadonlySet<string> = new Set([
  "debug",
  "info",
  "warn",
  "error",
  "ok",
  "pending",
  "running",
  "success",
  "failed",
  "failure",
  "skipped",
  "cancelled",
  "done",
  "queued",
  "idle",
  "paused",
  "active",
  "inactive",
  "ready",
  "connected",
  "disconnected",
  "locked",
  "unlocked",
  "start",
  "started",
  "end",
  "finished",
  "init",
  "sync",
  "classify",
  "apply",
  "undo",
  "commit",
  "rollback",
  "archive",
  "label",
  "scan",
  "unsubscribe",
  "gmail",
  "outlook",
  "google",
  "microsoft",
  "account",
  "message",
  "thread",
  "workspace",
  "action",
  "suggestion",
  "batch",
  "mailbox",
  "rule",
  "sender",
]);

export function accepts(shape: Shape, value: string): boolean {
  switch (shape) {
    case "id":
      return isLogSafeId(value);
    case "enum":
      return ENUM_VALUES.has(value);
    case "code":
      return CODES.has(value);
    case "http":
      return ENUM_VALUES.has(value);
    case "number":
      return false;
  }
}

// A key that looks secret hides its value whatever the value is (string, number, object).
const SECRET_WORDS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "token",
  "tokens",
  "secret",
  "secrets",
  "password",
  "passwd",
  "pwd",
  "passphrase",
  "credential",
  "credentials",
  "signature",
  "session",
  "sessions",
  "auth",
  "oauth",
  "bearer",
  "key",
  "keys",
  "apikey",
  "code",
  "jwt",
  "sid",
  "otp",
  "private",
]);
const SECRET_SUBSTRING = /token|secret|passw|credential|authorization|cookie|apikey|signature/i;

export function looksSecret(key: string): boolean {
  if (SECRET_SUBSTRING.test(key.replace(/[\s_.-]/g, ""))) return true;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((w) => SECRET_WORDS.has(w));
}
