import { Button } from "@pochimail/ui/components/button";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { t } from "@pochimail/ui/i18n/format.ts";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import type { Locale } from "@pochimail/ui/i18n/messages.ts";
import { useState } from "react";

/**
 * Dev-only layout probe: the same catalog strings in the given locale. Stories render English,
 * French, Japanese and the long accented pseudo-locale side by side at 320px.
 */
export function PseudoLocalePreview({ locale = "pseudo" }: { readonly locale?: Locale }) {
  const options = { locale };
  const device = deviceLabel("Mac", locale);
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <StatusStrip
        progress={62}
        headline={t("overview.sorting", { device }, options)}
        status={t("overview.email.count", { count: 1240 }, options)}
      >
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? t("overview.resume", {}, options) : t("overview.pause", {}, options)}
        </Button>
        <Button size="sm">{t("overview.viewSummary", {}, options)}</Button>
      </StatusStrip>
      <ul className="m-0 min-w-0 p-0">
        <RecommendationRow
          sentence={t("overview.size.free", { size: 3100, total: 6400 }, options)}
          reason={t("overview.promise.device", { device }, options)}
          size="3.1 GB"
          reviewLabel={t("overview.review", {}, options)}
        />
      </ul>
      <p className="m-0 min-w-0 text-sm break-words text-foreground-tertiary">
        {t("summary.from", { date: "2026-11-19T12:00:00Z", device }, options)}
      </p>
    </div>
  );
}
