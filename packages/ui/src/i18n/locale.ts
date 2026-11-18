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

/** Generic fallback word, never a guessed machine: the host is not always a computer (decided 2026-11-19). */
const DEVICE_LABEL: Readonly<Record<UserLocale, string>> = {
  en: "device",
  fr: "appareil",
  ja: "デバイス",
};

/**
 * The OS name is a label, not a code: `deviceName()` returns "device" when it cannot tell,
 * so French/Japanese copy says "votre appareil" or "このデバイス", never an English word.
 */
export const deviceLabel = (device: string, locale: Locale): string =>
  device === "device" ? DEVICE_LABEL[locale === "pseudo" ? "en" : locale] : device;
