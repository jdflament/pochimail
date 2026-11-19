// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getLocale, setLocale } from "./format.ts";
import { I18nProvider, useLocale, useT } from "./i18n-provider.tsx";

afterEach(() => {
  cleanup();
  setLocale("en");
});

function Screen() {
  const t = useT();
  const locale = useLocale();
  return (
    <main data-testid="screen" lang={locale}>
      <h1>{t("activity.title")}</h1>
    </main>
  );
}

// Guards: a language change that needs a restart because mounted screens keep the old words.
it("re-renders a mounted screen in the new language without remounting it", () => {
  const { rerender } = render(
    <I18nProvider locale="en">
      <Screen />
    </I18nProvider>,
  );
  const screenNode = screen.getByTestId("screen");
  expect(screenNode.textContent).toBe("Activity");

  rerender(
    <I18nProvider locale="fr">
      <Screen />
    </I18nProvider>,
  );
  expect(screen.getByTestId("screen")).toBe(screenNode);
  expect(screenNode.textContent).toBe("Activité");
  expect(screenNode.getAttribute("lang")).toBe("fr");

  rerender(
    <I18nProvider locale="ja">
      <Screen />
    </I18nProvider>,
  );
  expect(screenNode.textContent).toBe("アクティビティ");
});

// Guards: non-React code (toast callbacks) speaking another language than the screen around it.
it("keeps the global locale in step with the provider", () => {
  const { rerender } = render(
    <I18nProvider locale="fr">
      <Screen />
    </I18nProvider>,
  );
  expect(getLocale()).toBe("fr");
  rerender(
    <I18nProvider locale="ja">
      <Screen />
    </I18nProvider>,
  );
  expect(getLocale()).toBe("ja");
});

// Guards: stories and tests that render a component without a provider going blank or throwing.
it("falls back to the global locale outside a provider", () => {
  setLocale("fr");
  render(<Screen />);
  expect(screen.getByTestId("screen").textContent).toBe("Activité");
});
