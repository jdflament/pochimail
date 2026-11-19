import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo } from "react";
import { getLocale, setLocale, t } from "./format.ts";
import type { MessageKey, MessageValues, UserLocale } from "./messages.ts";

/** `undefined` outside a provider: hooks then read the global locale, as non-React code does. */
const LocaleContext = createContext<UserLocale | undefined>(undefined);

/**
 * The active UI language for everything below it. Changing `locale` re-renders every consumer of
 * `useT()` and `useLocale()`. The global `t()` is kept in step for non-React code only.
 */
export function I18nProvider({
  locale,
  children,
}: {
  readonly locale: UserLocale;
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => setLocale(locale), [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export type T = <K extends MessageKey>(key: K, values?: MessageValues<K>) => string;

/** The `t()` of the surrounding provider's language. Stable until the language changes. */
export function useT(): T {
  const locale = useContext(LocaleContext);
  return useMemo<T>(
    () => (key, values) => (locale === undefined ? t(key, values) : t(key, values, { locale })),
    [locale],
  );
}

export function useLocale(): UserLocale {
  const locale = useContext(LocaleContext);
  return locale ?? getLocale();
}
