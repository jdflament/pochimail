import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";

export function ConnectPage() {
  const t = useT();
  return (
    <div className="text-center">
      <h1 className="text-4xl text-balance">{t("connect.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("connect.description")}</p>
    </div>
  );
}
