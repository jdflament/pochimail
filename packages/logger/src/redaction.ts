import { accepts, CODES, looksSecret, REDACTED, type Shape, shapeOf } from "./field-rules.ts";

// Every pattern below is linear: bounded {m,n} repeats, no nested or overlapping quantifiers.
// On top of that, redactString never runs them on more than MAX_TEXT characters.
const AT_WORD = /[ \t]{0,8}[[({<][ \t]{0,8}at[ \t]{0,8}[\])}>][ \t]{0,8}/gi;
const DOT_WORD = /[ \t]{0,8}[[({<][ \t]{0,8}dot[ \t]{0,8}[\])}>][ \t]{0,8}/gi;
// "jane at example dot com": plain words, at least one "dot" word so ordinary prose survives.
const PLAIN_WORD_ADDRESS =
  /[\w.+-]{1,64}[ \t]{1,4}at[ \t]{1,4}[\w-]{1,64}(?:(?:[ \t]{1,4}dot[ \t]{1,4}|\.)[\w-]{1,64}){1,4}/gi;
// "jane @ example.com", "jane@ example.com": blanks around "@" do not hide an address.
const SPACED_AT = /[ \t]{0,8}@[ \t]{0,8}/g;
// Zero-width, soft hyphen, bidi and every other invisible format character.
const INVISIBLE = /\p{Cf}/gu;
// "Jane Doe <jane@example.com>" and '"Doe, Jane" <jane@example.com>': drop the display name too.
const NAMED_ADDRESS =
  /(?:"[^"]{0,256}"|[^\s<>"@,;]{1,64}(?:[ \t]{1,8}[^\s<>"@,;]{1,64}){0,4})[ \t]{0,8}<[^<>\s]{0,256}@[^<>\s]{0,256}>/g;
// Header-like pairs swallow the rest of the line: values hold spaces ("Bearer x", "a=1; b=2").
const HEADER_LINE = /(?:authorization|cookie)["']?[ \t]{0,8}[:=][^\r\n]*/gi;
const SCHEME = /(?:Bearer|Basic)[ \t]{1,8}[A-Za-z0-9._~+/=-]{1,2048}/gi;
const JWT = /eyJ[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{0,2048}/g;
// One table of provider token prefixes. No leading \b: AUTH_ghp_… and glued tokens must match.
const TOKEN_PREFIXES: readonly string[] = [
  "gh[pousr]_[A-Za-z0-9]{10,2048}",
  "github_pat_[A-Za-z0-9_]{10,2048}",
  "ya29\\.[A-Za-z0-9._-]{1,2048}",
  "xox[a-z]-[A-Za-z0-9-]{6,2048}",
  "sk-[A-Za-z0-9_-]{10,2048}",
  "(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{6,2048}",
  "(?:AKIA|ASIA)[A-Z0-9]{12,2048}",
  "AIza[A-Za-z0-9_-]{20,2048}",
  "1//[A-Za-z0-9._-]{16,2048}",
];
const TOKEN_PREFIX = new RegExp(TOKEN_PREFIXES.join("|"), "g");
const SECRET_PAIR =
  /[\w.-]{0,64}(?:authorization|cookie|token|secret|passw(?:or)?d|passphrase|pwd|credential|signature|session|auth|api[_-]?key|key|code|sid|jwt|otp)[\w.-]{0,64}["']?[ \t]{0,8}[=:][ \t]{0,8}(?:"[^"]{0,2048}"|'[^']{0,2048}'|[^\s,;&]{1,2048})/gi;
// Any opaque run of 20+ base64/base64url/token characters: base64 mail, unknown token formats.
// IDs belong in safe keys, not in free text.
const OPAQUE_RUN = /[A-Za-z0-9+/=_-]{20,}/g;
const ADDRESS_CHAR = /[^\s<>"'(),;:@]/;

const MAX_DEPTH = 5;
const MAX_PASSES = 8;
/** Longer strings are never matched against: they become a "[truncated N chars]" marker. */
const MAX_TEXT = 2048;
const MAX_STACK_LINES = 20;
const MAX_ARRAY = 50;
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  commat: "@",
  period: ".",
  colon: ":",
  equals: "=",
  sol: "/",
  plus: "+",
  num: "#",
  lpar: "(",
  rpar: ")",
  lsqb: "[",
  rsqb: "]",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{1,8}));/gi,
    (match, dec, hex, name) => {
      if (name) return ENTITIES[String(name).toLowerCase()] ?? match;
      const point = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    },
  );
}

function decodePercent(text: string): string {
  if (!text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%([0-9a-f]{2})/gi, (match, hex) => {
      const n = Number.parseInt(hex, 16);
      return n < 0x80 ? String.fromCharCode(n) : match;
    });
  }
}

/** NFKC + invisible chars + HTML entities + percent-decoding, repeated until stable (bounded). */
function normalise(value: string): string | null {
  let out = value;
  for (let i = 0; i < MAX_PASSES; i++) {
    const next = decodePercent(decodeEntities(out.normalize("NFKC").replace(INVISIBLE, "")));
    if (next === out) return out;
    if (next.length > MAX_TEXT * 4) return null; // NFKC can expand: stay bounded.
    out = next;
  }
  return null; // still changing after the cap: nested encoding bomb, redact whole.
}

/** anything@anything, found by scanning for "@" and expanding: linear, no TLD required. */
function redactAddresses(text: string): string {
  if (!text.includes("@")) return text;
  let out = "";
  let last = 0;
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    let left = at;
    if (text.charAt(at - 1) === '"') {
      // Quoted local part: "jane doe"@example.com. Look back a bounded distance for the opening quote.
      for (let q = at - 2; q >= last && q >= at - 66; q--) {
        if (text.charAt(q) === '"') {
          left = q;
          break;
        }
      }
    }
    while (left > last && ADDRESS_CHAR.test(text.charAt(left - 1))) left--;
    let right = at + 1;
    while (right < text.length && ADDRESS_CHAR.test(text.charAt(right))) right++;
    if (left < at && right > at + 1) {
      out += text.slice(last, left) + REDACTED;
      last = right;
    }
  }
  return out + text.slice(last);
}

function redactString(value: string): string {
  if (value.length > MAX_TEXT) return `[truncated ${value.length} chars]`;
  const normalised = normalise(value);
  if (normalised === null) return REDACTED;
  return redactAddresses(
    normalised
      .replace(AT_WORD, "@")
      .replace(DOT_WORD, ".")
      .replace(SPACED_AT, "@")
      .replace(PLAIN_WORD_ADDRESS, REDACTED)
      .replace(HEADER_LINE, REDACTED)
      .replace(SCHEME, REDACTED)
      .replace(JWT, REDACTED)
      .replace(TOKEN_PREFIX, REDACTED)
      .replace(SECRET_PAIR, REDACTED)
      .replace(NAMED_ADDRESS, REDACTED),
  ).replace(OPAQUE_RUN, REDACTED);
}

function redactStack(stack: string): string {
  const lines = stack.split("\n");
  const kept = lines.slice(0, MAX_STACK_LINES).map(redactString);
  if (lines.length > MAX_STACK_LINES)
    kept.push(`[truncated ${lines.length - MAX_STACK_LINES} lines]`);
  return kept.join("\n");
}

function redactError(error: Error, depth: number, path: Set<object>): Record<string, unknown> {
  const code = (error as { code?: unknown }).code;
  const cause = (error as { cause?: unknown }).cause;
  path.add(error);
  try {
    return {
      name: redactString(String(error.name)),
      message: redactString(String(error.message)),
      ...(typeof code === "string" ? { code: CODES.has(code) ? code : REDACTED } : {}),
      ...(typeof error.stack === "string" ? { stack: redactStack(error.stack) } : {}),
      ...(cause === undefined ? {} : { cause: redactValue(cause, null, depth + 1, path) }),
    };
  } finally {
    path.delete(error);
  }
}

function numberAllowed(shape: Shape | null, value: number): boolean {
  if (shape === "number") return true;
  return shape === "http" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function redactValue(
  value: unknown,
  shape: Shape | null,
  depth: number,
  path: Set<object>,
): unknown {
  if (typeof value === "string") {
    return shape !== null && accepts(shape, value) ? value : REDACTED;
  }
  if (typeof value === "number") return numberAllowed(shape, value) ? value : REDACTED;
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" ? REDACTED : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`;
  if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) {
    return `[binary ${value.byteLength} bytes]`;
  }
  if (depth >= MAX_DEPTH || path.has(value)) return REDACTED;
  if (value instanceof Error) return redactError(value, depth, path);
  path.add(value);
  try {
    if (value instanceof Map) {
      const entries = Object.fromEntries([...value].map(([k, v]) => [String(k), v]));
      return redactFields(entries, depth + 1, path);
    }
    if (value instanceof Set) {
      return [...value].map((item) => redactValue(item, null, depth + 1, path));
    }
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY)
        .map((item) => redactValue(item, shape, depth + 1, path));
      if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} more]`);
      return items;
    }
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
    if (safeKey !== key) {
      out[safeKey] = redactValue(value, null, depth, path);
    } else if (key !== "code" && looksSecret(key)) {
      out[safeKey] = REDACTED;
    } else {
      out[safeKey] = redactValue(value, shapeOf(key), depth, path);
    }
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
