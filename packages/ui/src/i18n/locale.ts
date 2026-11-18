import type { Locale, UserLocale } from "./messages.ts";

/**
 * Picks the UI language from the OS/app language list, in the user's preference order.
 * Only the language prefix matters, and the first supported tag wins: `[en-US, fr-FR]` is
 * English, `[fr-FR, en-US]` is French, anything unsupported falls through to English.
 */
export const localeFromLanguages = (languages: readonly string[] | undefined): UserLocale => {
  for (const tag of languages ?? []) {
    const language = tag.toLowerCase().split(/[-_]/u)[0];
    if (language === "en" || language === "fr" || language === "ja") return language;
  }
  return "en";
};

const COMPUTER_LABEL: Readonly<Record<UserLocale, string>> = {
  en: "computer",
  fr: "ordinateur",
  ja: "パソコン",
};

/**
 * The OS name is a label, not a code: `deviceName()` returns "computer" when it cannot tell,
 * and French/Japanese copy must not say "votre computer" or "このcomputer".
 */
export const deviceLabel = (device: string, locale: Locale): string =>
  device === "computer" ? COMPUTER_LABEL[locale === "pseudo" ? "en" : locale] : device;
