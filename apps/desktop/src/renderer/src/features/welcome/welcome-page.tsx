import { t } from "@pochimail/ui/i18n/format.ts";

export function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-8 text-center">
      <h1 className="text-4xl">{t("welcome.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("welcome.headline")}</p>
      <p className="mt-8 text-sm text-foreground-tertiary">{t("overview.privacy")}</p>
    </main>
  );
}
