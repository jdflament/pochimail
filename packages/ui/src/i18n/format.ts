import { fr } from "./fr.ts";
import { ja } from "./ja.ts";
import {
  type Catalog,
  type Locale,
  type MessageKey,
  type MessageValues,
  messages,
  type UserLocale,
} from "./messages.ts";
import { pseudo } from "./pseudo.ts";

type Params = Record<string, string | number>;

/** Every shipped catalog, English included: it is the default and the safety-net fallback. */
const catalogs: Readonly<Record<UserLocale, Catalog>> = { en: messages, fr, ja };

const numberFormats = new Map<UserLocale, Intl.NumberFormat>();
const pluralRules: Record<UserLocale, Intl.PluralRules> = {
  en: new Intl.PluralRules("en"),
  fr: new Intl.PluralRules("fr"),
  ja: new Intl.PluralRules("ja"),
};
const dateFormats = new Map<string, Intl.DateTimeFormat>();

const numberFormat = (locale: UserLocale): Intl.NumberFormat => {
  const cached = numberFormats.get(locale);
  if (cached !== undefined) return cached;
  const format = new Intl.NumberFormat(locale);
  numberFormats.set(locale, format);
  return format;
};

const DATE_STYLES = ["short", "medium", "long", "full"] as const;
type DateStyle = (typeof DATE_STYLES)[number];
const isDateStyle = (value: string): value is DateStyle =>
  (DATE_STYLES as readonly string[]).includes(value);

const dateFormat = (locale: UserLocale, style: DateStyle): Intl.DateTimeFormat => {
  const key = `${locale}:${style}`;
  const cached = dateFormats.get(key);
  if (cached !== undefined) return cached;
  const format = new Intl.DateTimeFormat(locale, { dateStyle: style });
  dateFormats.set(key, format);
  return format;
};

const closingBrace = (pattern: string, open: number): number => {
  let depth = 0;
  for (let index = open; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unbalanced ICU message: ${pattern}`);
};

const param = (params: Params, name: string): string | number => {
  const value = params[name];
  if (value === undefined) throw new Error(`missing value for "${name}"`);
  return value;
};

const casesOf = (body: string): ReadonlyMap<string, string> => {
  const cases = new Map<string, string>();
  const casePattern = /(?:=\d+|zero|one|two|few|many|other)\s*\{/g;
  for (let match = casePattern.exec(body); match !== null; match = casePattern.exec(body)) {
    const open = casePattern.lastIndex - 1;
    const close = closingBrace(body, open);
    const keyword = match[0].slice(0, -1).trim();
    cases.set(keyword, body.slice(open + 1, close));
    casePattern.lastIndex = close + 1;
  }
  return cases;
};

const token = (content: string, params: Params, locale: UserLocale): string => {
  const comma = content.indexOf(",");
  if (comma < 0) return String(param(params, content.trim()));

  const name = content.slice(0, comma).trim();
  const rest = content.slice(comma + 1).trim();
  const space = rest.indexOf(" ");
  const kind = (space < 0 ? rest : rest.slice(0, space)).replace(/,$/, "");
  const value = param(params, name);

  if (kind === "number") return numberFormat(locale).format(Number(value));
  if (kind === "date") {
    const style = (space < 0 ? "" : rest.slice(space + 1)).trim() || "medium";
    if (!isDateStyle(style)) throw new Error(`unsupported date style "${style}"`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`invalid date for "${name}"`);
    return dateFormat(locale, style).format(date);
  }
  if (kind === "plural") {
    const count = Number(value);
    const cases = casesOf(space < 0 ? "" : rest.slice(space + 1));
    const body =
      cases.get(`=${count}`) ?? cases.get(pluralRules[locale].select(count)) ?? cases.get("other");
    if (body === undefined) throw new Error(`plural "${name}" has no other case`);
    return render(body.replaceAll("#", numberFormat(locale).format(count)), params, locale);
  }
  throw new Error(`unsupported ICU type "${kind}"`);
};

/** Formats one catalog pattern. Kept private: callers go through `t()` or `translate()`. */
const render = (pattern: string, params: Params, locale: UserLocale): string => {
  let result = "";
  let index = 0;
  while (index < pattern.length) {
    const open = pattern.indexOf("{", index);
    if (open < 0) return result + pattern.slice(index);
    result += pattern.slice(index, open);
    const close = closingBrace(pattern, open);
    result += token(pattern.slice(open + 1, close), params, locale);
    index = close + 1;
  }
  return result;
};

/**
 * Formats one key from a catalog, falling back to English when that catalog lacks the key, so a
 * new string can never become a blank line in a shipped language.
 */
export function translate<K extends MessageKey>(
  catalog: Partial<Catalog>,
  key: K,
  values: MessageValues<K> | undefined,
  locale: UserLocale,
): string {
  const message = catalog[key] ?? messages[key];
  return render(message.text, { ...values }, locale);
}

let activeLocale: UserLocale = "en";

/** The one place a later Settings screen changes the UI language; `pseudo` is not assignable. */
export function setLocale(locale: UserLocale): void {
  activeLocale = locale;
}

export function getLocale(): UserLocale {
  return activeLocale;
}

/**
 * The only string API screens and stories use. Keys and their parameter names come from `messages`,
 * so an unknown key or a renamed placeholder is a type error rather than a runtime surprise.
 */
export function t<K extends MessageKey>(
  key: K,
  values?: MessageValues<K>,
  options?: { readonly locale?: Locale },
): string {
  const locale = options?.locale ?? activeLocale;
  const intlLocale: UserLocale = locale === "pseudo" ? "en" : locale;
  const text = translate(catalogs[intlLocale], key, values, intlLocale);
  return locale === "pseudo" ? pseudo(text) : text;
}
