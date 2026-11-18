import { t } from "@pochimail/ui/i18n/format.ts";

export function DevGalleryPage() {
  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl">{t("devGallery.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("devGallery.description")}</p>
    </main>
  );
}
