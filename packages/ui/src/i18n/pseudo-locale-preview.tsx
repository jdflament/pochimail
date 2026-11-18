import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { t } from "@pochimail/ui/i18n/format.ts";
import type { Locale } from "@pochimail/ui/i18n/messages.ts";

/** Dev-only layout probe: the same catalog strings in English and in long accented pseudo-locale. */
export function PseudoLocalePreview({ locale = "pseudo" }: { readonly locale?: Locale }) {
  const options = { locale };
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <StatusStrip
        progress={62}
        headline={t("overview.sorting", { device: "Mac" }, options)}
        status={t("overview.email.count", { count: 1240 }, options)}
        labels={{
          pause: t("overview.pause", {}, options),
          resume: t("overview.resume", {}, options),
          viewSummary: t("overview.viewSummary", {}, options),
        }}
      />
      <ul className="m-0 min-w-0 p-0">
        <RecommendationRow
          sentence={t("overview.size.free", { size: 3100, total: 6400 }, options)}
          reason={t("overview.promise.device", { device: "Mac" }, options)}
          size="3.1 GB"
          reviewLabel={t("overview.review", {}, options)}
        />
      </ul>
    </div>
  );
}
