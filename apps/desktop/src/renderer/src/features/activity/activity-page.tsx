import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";

export function ActivityPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl">{t("activity.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("activity.description")}</p>
    </main>
  );
}
