import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { useParams } from "@tanstack/react-router";

export function CategoryPage() {
  const t = useT();
  const { categoryId } = useParams({ from: "/shell/category/$categoryId" });
  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl capitalize">{categoryId.replace(/-/g, " ")}</h1>
      <p className="mt-4 text-muted-foreground">{t("category.placeholder")}</p>
    </main>
  );
}
