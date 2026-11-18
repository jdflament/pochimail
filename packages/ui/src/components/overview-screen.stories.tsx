import { Button } from "@pochimail/ui/components/button";
import { EmptyState } from "@pochimail/ui/components/empty-state";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { SignalRow } from "@pochimail/ui/components/signal-row";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { getLocale, setLocale, t } from "@pochimail/ui/i18n/format.ts";
import type { UserLocale } from "@pochimail/ui/i18n/messages.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";

// A composition story: the Overview screen from the existing pieces, with the demo numbers. The real screen lives in
// apps/desktop (features/overview) and feeds the same pieces from the worker; this shows its states and locales.
type Data = {
  scanned: number;
  waiting: number;
  deadlines: number;
  important: number;
  oldestWaitingDays: number;
  cleanable: { key: "newsletters" | "promotions" | "notifications" | "signins"; count: number }[];
  scanning: boolean;
};

const sorted: Data = {
  scanned: 48312,
  waiting: 7,
  deadlines: 3,
  important: 12,
  oldestWaitingDays: 9,
  cleanable: [
    { key: "newsletters", count: 10410 },
    { key: "notifications", count: 12940 },
    { key: "promotions", count: 9206 },
    { key: "signins", count: 1780 },
  ],
  scanning: false,
};

function OverviewScreen({ data, locale }: { data: Data; locale: UserLocale }) {
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const previous = getLocale();
    setLocale(locale);
    setReady(true);
    return () => setLocale(previous);
  }, [locale]);
  if (!ready) return null;

  const cleanable = [...data.cleanable].sort((a, b) => b.count - a.count);
  const free = cleanable.reduce((sum, c) => sum + c.count, 0);
  const keep = Math.max(0, data.scanned - free);
  const review = t("overview.review");
  const toReview = data.waiting + data.deadlines + data.important;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      {data.scanning ? (
        <StatusStrip
          progress={62}
          headline={t("overview.sorting", { device: "Mac" })}
          status={t("overview.scan.progress", { processed: 30000, total: 48312 })}
        >
          <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? t("overview.resume") : t("overview.pause")}
          </Button>
        </StatusStrip>
      ) : null}
      <header className="flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-4xl">{t("overview.title")}</h1>
        <span className="text-muted-foreground">{t("overview.accounts", { count: 2 })}</span>
      </header>
      {data.scanned === 0 ? (
        <EmptyState
          title={t("overview.empty.title")}
          description={t("overview.empty.description")}
          action={{ label: t("overview.empty.action"), onClick: () => {} }}
        />
      ) : (
        <>
          <section aria-labelledby="catch" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="catch" className="text-xl font-semibold">
                {t("overview.catch.title")}
              </h2>
              <span className="text-sm text-muted-foreground">{t("overview.catch.note")}</span>
            </div>
            {toReview === 0 ? (
              <p className="text-muted-foreground">{t("overview.nothingToCatch")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y p-0">
                <SignalRow
                  figure={data.waiting}
                  title={t("overview.waiting.title", { count: data.waiting })}
                  detail={t("overview.waiting.detail", { days: data.oldestWaitingDays })}
                  reviewLabel={review}
                />
                <SignalRow
                  figure={data.deadlines}
                  title={t("overview.deadlines.title", { count: data.deadlines })}
                  detail={t("overview.deadlines.detail")}
                  reviewLabel={review}
                />
                <SignalRow
                  figure={data.important}
                  title={t("overview.important.title", { count: data.important })}
                  detail={t("overview.important.detail")}
                  reviewLabel={review}
                />
              </ul>
            )}
          </section>
          <section aria-labelledby="clean" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 id="clean" className="text-xl font-semibold">
                {t("overview.clean.title")}
              </h2>
              <span className="text-sm text-muted-foreground">{t("overview.clean.note")}</span>
            </div>
            {free === 0 ? (
              <p className="text-muted-foreground">{t("overview.nothingToClean")}</p>
            ) : (
              <>
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-[34px] leading-none font-[450] tabular-nums">
                    {free.toLocaleString(locale)}
                  </span>
                  <span className="text-muted-foreground">
                    {t("overview.clean.headline", { total: data.scanned })}
                  </span>
                </p>
                <StorageBar
                  summary={t("overview.clean.summary", { total: data.scanned })}
                  segments={[
                    {
                      id: "keep",
                      label: t("overview.clean.keep"),
                      value: keep,
                      size: t("overview.email.count", { count: keep }),
                      pattern: "solid",
                    },
                    {
                      id: "clean",
                      label: t("overview.clean.free"),
                      value: free,
                      size: t("overview.email.count", { count: free }),
                      pattern: "hatched",
                    },
                  ]}
                />
                <ul className="m-0 flex list-none flex-col divide-y p-0">
                  {cleanable.map((item) => (
                    <RecommendationRow
                      key={item.key}
                      sentence={t(`overview.rec.${item.key}.sentence`)}
                      reason={t(`overview.rec.${item.key}.reason`)}
                      size={t("overview.email.count", { count: item.count })}
                      reviewLabel={review}
                    />
                  ))}
                </ul>
              </>
            )}
            <p className="text-sm text-muted-foreground">{t("overview.clean.never")}</p>
          </section>
        </>
      )}
    </main>
  );
}

const meta = {
  title: "Screens/Overview",
  component: OverviewScreen,
  parameters: { layout: "fullscreen" },
  args: { data: sorted, locale: "en" },
} satisfies Meta<typeof OverviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sorted: Story = {};
export const WhileSorting: Story = { args: { data: { ...sorted, scanning: true } } };
export const NothingToDo: Story = {
  args: { data: { ...sorted, waiting: 0, deadlines: 0, important: 0, cleanable: [] } },
};
export const NoEmails: Story = { args: { data: { ...sorted, scanned: 0 } } };
export const French: Story = { args: { locale: "fr", data: { ...sorted, scanning: true } } };
export const Japanese: Story = { args: { locale: "ja", data: { ...sorted, scanning: true } } };
