export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogRecord = {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
};

/** Receives only already-redacted records. Concrete sinks live in adapters. */
export interface LogSink {
  write(record: LogRecord): void;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export const REDACTED = "[redacted]";

// Allow-list: only these structured keys may carry a string value through to a sink.
// Everything else (unknown = potentially PII) has its string values redacted.
// Numbers, booleans and null are inert and always pass.
const SAFE_KEY =
  /^(?:id|ids|[a-z][a-zA-Z0-9]*Ids?|count|[a-z][a-zA-Z0-9]*Count|total|size|attempt|attempts|retries|[a-z][a-zA-Z0-9]*Ms|code|kind|type|state|phase|status|provider|operation|level)$/;

const ZERO_WIDTH = /[\u200b-\u200f\u2060\ufeff]/g;
const AT_WORD = /\s*[[({<]\s*at\s*[\])}>]\s*/gi;
const DOT_WORD = /\s*[[({<]\s*dot\s*[\])}>]\s*/gi;
// "Jane Doe <jane@example.com>" and '"Doe, Jane" <jane@example.com>': drop the display name too.
const NAMED_ADDRESS = /(?:"[^"]*"|[^\s<>"@,;]+(?:\s+[^\s<>"@,;]+){0,4})\s*<[^<>\s]*@[^<>\s]*>/g;
const EMAIL = /[^\s<>"'(),;:@]+@[^\s<>"'(),;:@]+\.[^\s<>"'(),;:@]+/g;
const AUTH_HEADER = /\b(?:proxy-)?authorization\s*[:=]\s*[^\s,;]+(?:\s+[^\s,;]+)?/gi;
const SCHEME = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const TOKEN_PREFIX =
  /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{8,}|sk-[A-Za-z0-9_-]{16,}|ya29\.[A-Za-z0-9._-]+|AIza[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{12,})|(?<![A-Za-z0-9])1\/\/[A-Za-z0-9._-]{20,}/g;
const SECRET_PAIR =
  /[\w-]*(?:token|secret|password|passwd|pwd|api[_-]?key|credential|signature)[\w-]*["']?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi;

const MAX_DEPTH = 5;

function decode(value: string): string {
  let out = value;
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

export function redactString(value: string): string {
  const text = decode(value).replace(ZERO_WIDTH, "").replace(AT_WORD, "@").replace(DOT_WORD, ".");
  return text
    .replace(AUTH_HEADER, REDACTED)
    .replace(SCHEME, REDACTED)
    .replace(JWT, REDACTED)
    .replace(TOKEN_PREFIX, REDACTED)
    .replace(SECRET_PAIR, REDACTED)
    .replace(NAMED_ADDRESS, REDACTED)
    .replace(EMAIL, REDACTED);
}

function redactValue(value: unknown, safe: boolean, depth: number, path: Set<object>): unknown {
  if (typeof value === "string") return safe ? redactString(value) : REDACTED;
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" ? REDACTED : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH || path.has(value)) return REDACTED;
  if (value instanceof Error) {
    // Error messages may embed third-party PII: keep only the name and stable code.
    const code = (value as { code?: unknown }).code;
    return { name: value.name, ...(typeof code === "string" ? { code } : {}) };
  }
  path.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redactValue(item, safe, depth + 1, path));
    return redactFields(value as Record<string, unknown>, depth + 1, path);
  } finally {
    path.delete(value);
  }
}

function redactFields(
  fields: Record<string, unknown>,
  depth: number,
  path: Set<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    // Keys can carry PII too (e.g. an address used as a map key).
    const safeKey = redactString(key);
    out[safeKey] = redactValue(value, safeKey === key && SAFE_KEY.test(key), depth, path);
  }
  return out;
}

export function redactRecord(
  message: string,
  fields: Record<string, unknown> | undefined,
): { message: string; fields: Record<string, unknown> } {
  return {
    message: redactString(message),
    fields: redactFields(fields ?? {}, 0, new Set()),
  };
}

/**
 * Creates a logger. Redaction is always on and has no opt-out: the sink only ever
 * sees redacted messages and fields.
 */
export function createLogger(options: { sink: LogSink }): Logger {
  return build(options.sink, {});
}

function build(sink: LogSink, bound: Record<string, unknown>): Logger {
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    const redacted = redactRecord(message, { ...bound, ...fields });
    sink.write({ level, message: redacted.message, fields: redacted.fields });
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => build(sink, { ...bound, ...fields }),
  };
}
