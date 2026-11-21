import { SignalRow } from "@pochimail/ui/components/signal-row";
import { useLocale, useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { type OverviewData, type SignalView, signalRows } from "./overview-figures.ts";

/** Catch what matters: the emails that need the person, never cleaned. */
export function CatchSection({ data, onReview }: { data: OverviewData; onReview: () => void }) {
  const t = useT();
  const locale = useLocale();
  const signals = signalRows(data);
  const detail = (signal: SignalView) => {
    if (signal.id !== "waiting") return t(signal.detail);
    return data.oldestWaitingDays > 0
      ? t("overview.waiting.detail", { days: data.oldestWaitingDays })
      : undefined;
  };
  return (
    <section aria-labelledby="catch-title" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="catch-title" className="text-xl font-semibold">
          {t("overview.catch.title")}
        </h2>
        <span className="text-ui text-muted-foreground">{t("overview.catch.note")}</span>
      </div>
      {signals.length === 0 ? (
        <p className="text-muted-foreground">{t("overview.nothingToCatch")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y p-0">
          {signals.map((signal) => (
            <SignalRow
              key={signal.id}
              figure={signal.count.toLocaleString(locale)}
              title={t(signal.title, { count: signal.count })}
              detail={detail(signal)}
              reviewLabel={t("overview.review")}
              onReview={onReview}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
