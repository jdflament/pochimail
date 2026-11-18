import { t } from "@pochimail/ui/i18n/format.ts";

export function ConnectPage() {
  return (
    <div className="text-center">
      <h1 className="text-4xl text-balance">{t("connect.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("connect.description")}</p>
    </div>
  );
}
