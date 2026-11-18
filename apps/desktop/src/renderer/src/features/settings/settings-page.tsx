import { t } from "@pochimail/ui/i18n/format.ts";

export function SettingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl">{t("settings.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("settings.description")}</p>
    </main>
  );
}
