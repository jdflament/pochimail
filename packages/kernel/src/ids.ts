import { InvalidIdError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type AccountId = Brand<string, "AccountId">;
export type MessageId = Brand<string, "MessageId">;
export type ThreadId = Brand<string, "ThreadId">;
export type TopicId = Brand<string, "TopicId">;

const MAX_ID_LENGTH = 512;
// Control characters (incl. NUL, newlines) never belong in an identifier or a log line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is exactly what is rejected.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function validate<B extends string>(kind: B, raw: unknown): Result<string, InvalidIdError> {
  if (typeof raw !== "string") return err(new InvalidIdError(kind, "must be a string"));
  if (raw.length === 0) return err(new InvalidIdError(kind, "must not be empty"));
  if (raw !== raw.trim()) return err(new InvalidIdError(kind, "must not have surrounding spaces"));
  if (raw.length > MAX_ID_LENGTH) return err(new InvalidIdError(kind, "is too long"));
  if (CONTROL_CHARS.test(raw)) return err(new InvalidIdError(kind, "has control characters"));
  return ok(raw);
}

export function makeId<T extends string>(kind: string) {
  return (raw: unknown): Result<T, InvalidIdError> =>
    validate(kind, raw) as Result<T, InvalidIdError>;
}

export const WorkspaceId = makeId<WorkspaceId>("WorkspaceId");
export const AccountId = makeId<AccountId>("AccountId");
export const MessageId = makeId<MessageId>("MessageId");
export const ThreadId = makeId<ThreadId>("ThreadId");
export const TopicId = makeId<TopicId>("TopicId");

/**
 * Strict, log-safe shape of OUR OWN identifiers: `<prefix>_<ULID>` or `<prefix>_<UUID>`.
 * Provider-assigned opaque IDs (see the constructors above) are intentionally more permissive
 * and therefore never pass this check: they must not reach a log line verbatim.
 */
export const ID_PREFIXES = [
  "wsp",
  "acc",
  "msg",
  "thr",
  "act",
  "sug",
  "mbx",
  "att",
  "top",
  "log",
] as const;
const ULID = "[0-7][0-9A-HJKMNP-TV-Z]{25}";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const LOG_ID_FORMAT = new RegExp(`^(?:${ID_PREFIXES.join("|")})_(?:${ULID}|${UUID})$`);

export function isLogSafeId(value: string): boolean {
  return LOG_ID_FORMAT.test(value);
}
