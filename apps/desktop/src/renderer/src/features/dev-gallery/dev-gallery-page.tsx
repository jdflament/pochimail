import { MotionProvider } from "@pochimail/ui/components/motion-provider";
import { Switch } from "@pochimail/ui/components/switch";
import { t } from "@pochimail/ui/i18n/format.ts";
import { useEffect, useState } from "react";
import { type GalleryEntry, motionEntries, stateEntries } from "./gallery-entries.tsx";

function Section({
  kind,
  title,
  entries,
}: {
  kind: string;
  title: string;
  entries: GalleryEntry[];
}) {
  return (
    <section aria-labelledby={`gallery-${kind}`} className="mt-10">
      <h2 id={`gallery-${kind}`} className="font-display text-2xl">
        {title}
      </h2>
      <ul className="m-0 mt-4 list-none p-0">
        {entries.map((entry) => (
          <li
            key={entry.id}
            data-gallery-entry={`${kind}:${entry.id}`}
            className="border-t border-border py-6"
          >
            {/* Dev-only label: the story's export name, deliberately outside the i18n catalog. */}
            <h3 className="mb-3 text-sm text-muted-foreground">{entry.name}</h3>
            <div className="max-w-[420px]">{entry.render()}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dev/E2E only (router.tsx): every required state and motion moment, with theme and reduced-motion toggles. */
export function DevGalleryPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const before = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    return () => {
      root.classList.toggle("dark", before);
    };
  }, [dark]);

  return (
    <MotionProvider animations={!reduceMotion}>
      <main className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-4xl">{t("devGallery.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("devGallery.description")}</p>
        <div className="mt-6 flex flex-wrap gap-8">
          <div className="flex items-center gap-2">
            <Switch id="gallery-dark" checked={dark} onCheckedChange={setDark} />
            <label htmlFor="gallery-dark">{t("devGallery.dark")}</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="gallery-reduceMotion"
              checked={reduceMotion}
              onCheckedChange={setReduceMotion}
            />
            <label htmlFor="gallery-reduceMotion">{t("devGallery.reduceMotion")}</label>
          </div>
        </div>
        <Section kind="state" title={t("devGallery.states")} entries={stateEntries} />
        <Section kind="motion" title={t("devGallery.motion")} entries={motionEntries} />
      </main>
    </MotionProvider>
  );
}
