import { localeFromLanguages } from "@pochimail/ui/i18n/locale.ts";
import type { UserLocale } from "@pochimail/ui/i18n/messages.ts";
import { useSyncExternalStore } from "react";

/** The OS/app language, read the same way Chromium does. */
const appLocale = (): UserLocale => localeFromLanguages(navigator.languages);

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("languagechange", onChange);
  return () => window.removeEventListener("languagechange", onChange);
};

/** The UI language: the OS language now, and again whenever the OS changes it (no restart). */
export const useAppLocale = (): UserLocale => useSyncExternalStore(subscribe, appLocale);
