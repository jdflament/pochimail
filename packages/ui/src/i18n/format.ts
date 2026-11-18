import { type Locale, type MessageKey, type MessageValues, messages } from "./messages.ts";
import { pseudo } from "./pseudo.ts";

type Params = Record<string, string | number>;

/** Pseudo is a layout probe, not a real locale: plural and number rules stay English. */
const ICU_LOCALE = "en";
const numberFormat = new Intl.NumberFormat(ICU_LOCALE);
const pluralRules = new Intl.PluralRules(ICU_LOCALE);

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

const token = (content: string, params: Params): string => {
  const comma = content.indexOf(",");
  if (comma < 0) return String(param(params, content.trim()));

  const name = content.slice(0, comma).trim();
  const rest = content.slice(comma + 1).trim();
  const space = rest.indexOf(" ");
  const kind = (space < 0 ? rest : rest.slice(0, space)).replace(/,$/, "");
  const value = param(params, name);

  if (kind === "number") return numberFormat.format(Number(value));
  if (kind === "plural") {
    const count = Number(value);
    const cases = casesOf(space < 0 ? "" : rest.slice(space + 1));
    const body =
      cases.get(`=${count}`) ?? cases.get(pluralRules.select(count)) ?? cases.get("other");
    if (body === undefined) throw new Error(`plural "${name}" has no other case`);
    return render(body.replaceAll("#", numberFormat.format(count)), params);
  }
  throw new Error(`unsupported ICU type "${kind}"`);
};

/** Formats one catalog pattern. Kept private: callers go through `t()` only. */
const render = (pattern: string, params: Params): string => {
  let result = "";
  let index = 0;
  while (index < pattern.length) {
    const open = pattern.indexOf("{", index);
    if (open < 0) return result + pattern.slice(index);
    result += pattern.slice(index, open);
    const close = closingBrace(pattern, open);
    result += token(pattern.slice(open + 1, close), params);
    index = close + 1;
  }
  return result;
};

/**
 * The only string API screens and stories use. Keys and their parameter names come from `messages`,
 * so an unknown key or a renamed placeholder is a type error rather than a runtime surprise.
 */
export function t<K extends MessageKey>(
  key: K,
  values?: MessageValues<K>,
  options?: { readonly locale?: Locale },
): string {
  const locale = options?.locale ?? "en";
  const text = render(messages[key].text, { ...values });
  return locale === "pseudo" ? pseudo(text) : text;
}
