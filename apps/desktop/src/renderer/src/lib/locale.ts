import { localeFromLanguages } from "@pochimail/ui/i18n/locale.ts";
import type { UserLocale } from "@pochimail/ui/i18n/messages.ts";

/**
 * The OS/app language at launch, read the same way Chromium does. One place to override later:
 * the Settings screen will call `setLocale()` from @pochimail/ui/i18n/format.ts.
 */
export const appLocale = (): UserLocale => localeFromLanguages(navigator.languages);
