import { t } from "@pochimail/ui/i18n/format.ts";

export function SetupPage() {
  return (
    <div className="text-center">
      <h1 className="text-4xl text-balance">{t("setup.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("setup.description")}</p>
    </div>
  );
}
