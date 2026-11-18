import { StorageError } from "@pochimail/core/errors";
import { err, ok, type Result } from "@pochimail/core/result";

/** Outbox and job payloads carry ids, cursors and enums, never mail content (D11, ADR 0009). */
const MAX_PAYLOAD_BYTES = 16 * 1024;
const FORBIDDEN_WORDS = new Set(["body", "html", "text", "attachment", "attachments"]);

/** Splits `bodyText`, `html_body` or `Attachment-Name` into lowercase words. */
const words = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);

function forbiddenKey(value: unknown, depth = 0): boolean {
  if (depth > 20 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => forbiddenKey(v, depth + 1));
  return Object.entries(value).some(
    ([key, v]) => words(key).some((w) => FORBIDDEN_WORDS.has(w)) || forbiddenKey(v, depth + 1),
  );
}

/** `ok(json)` when the payload is small and has no mail-content key; the message never echoes content. */
export function guardPayload(payload: unknown): Result<string, StorageError> {
  let json: string;
  try {
    json = JSON.stringify(payload ?? null);
  } catch {
    return err(new StorageError("Payload is not JSON-serializable"));
  }
  if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
    return err(
      new StorageError(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes (D11: no mail content)`),
    );
  }
  if (forbiddenKey(payload)) {
    return err(new StorageError("Payload has a key that may hold mail content (D11)"));
  }
  return ok(json);
}
