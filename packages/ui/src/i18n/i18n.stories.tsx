import type { Locale } from "@pochimail/ui/i18n/messages.ts";
import { PseudoLocalePreview } from "@pochimail/ui/i18n/pseudo-locale-preview.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";

const PREVIEWS: readonly { readonly locale: Locale; readonly label: string }[] = [
  { locale: "en", label: "English" },
  { locale: "fr", label: "Français" },
  { locale: "ja", label: "日本語" },
  { locale: "pseudo", label: "Pseudo (dev)" },
];

const meta = {
  title: "I18n/Catalog",
  component: PseudoLocalePreview,
} satisfies Meta<typeof PseudoLocalePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

// Every shipped locale plus the dev-only pseudo probe, each in a 320px column: expansion must wrap.
export const AllLocales: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6 p-6">
      {PREVIEWS.map(({ locale, label }) => (
        <section key={locale} className="w-[320px] max-w-full">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{label}</h2>
          <PseudoLocalePreview locale={locale} />
        </section>
      ))}
    </div>
  ),
};
