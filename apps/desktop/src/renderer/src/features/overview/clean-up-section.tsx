import type { CleanUpKind } from "@pochimail/cleanup/policies/clean-up-actions";
import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import { StorageBar } from "@pochimail/ui/components/storage-bar";
import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { type ActionRow, type CleanUpView, type RowFigure, sizeParts } from "./overview-figures.ts";

/** Clean up: the space figure and bar (delete rows only), then the rows that free space, then those that do not. */
export function CleanUpSection({
  view,
  accounts,
  sizeProvider,
  onReview,
}: {
  view: CleanUpView | null;
  accounts: number;
  /** The provider whose sizes may be unverified, named when no figure can be shown. */
  sizeProvider: "google" | "microsoft";
  onReview: (category: string, kind: CleanUpKind) => void;
}) {
  const t = useT();
  const row = (r: ActionRow) => (
    <RecommendationRow
      key={r.id}
      sentence={t(r.sentence, { count: r.count })}
      reason={t(r.reason)}
      size={figureText(r.figure)}
      reviewLabel={t("overview.review")}
      onReview={() => onReview(r.category, r.kind)}
    />
  );

  const sizeText = (bytes: number) => {
    const { key, size } = sizeParts(bytes);
    return t(key, { size });
  };
  const figureText = (figure: RowFigure) => {
    if (figure.tag === "bytes") return sizeText(figure.bytes);
    if (figure.tag === "unknown") return t("overview.size.unknown");
    if (figure.tag === "emails") return t("overview.email.count", { count: figure.count });
    return t(figure.tag === "senders" ? "overview.unit.senders" : "overview.unit.files", {
      count: figure.count,
    });
  };
  return (
    <section aria-labelledby="clean-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="clean-title" className="text-xl font-semibold">
          {t("overview.clean.title")}
        </h2>
        <span className="text-ui text-muted-foreground">{t("overview.clean.note")}</span>
      </div>
      {view === null ? (
        <p className="text-muted-foreground">{t("overview.nothingToClean")}</p>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-card px-5 py-4.5 shadow-[inset_0_0_0_1px_var(--border)]">
          {view.space === null ? (
            <p className="text-muted-foreground">
              {t("overview.clean.sizeUnknown", {
                provider: t(
                  sizeProvider === "microsoft"
                    ? "overview.provider.microsoft"
                    : "overview.provider.google",
                ),
              })}
            </p>
          ) : (
            <SpaceFigure space={view.space} accounts={accounts} sizeText={sizeText} />
          )}
          <ul className="m-0 flex list-none flex-col divide-y border-t p-0">
            {view.deletes.map(row)}
            {view.others.length > 0 ? (
              <li className="py-3.5 pb-1.5 text-ui text-muted-foreground">
                {t("overview.clean.noSpace")}
              </li>
            ) : null}
            {view.others.map(row)}
          </ul>
          <p className="border-t pt-3 text-ui text-muted-foreground">{t("overview.clean.never")}</p>
        </div>
      )}
    </section>
  );
}

function SpaceFigure({
  space,
  accounts,
  sizeText,
}: {
  space: NonNullable<CleanUpView["space"]>;
  accounts: number;
  sizeText: (bytes: number) => string;
}) {
  const t = useT();
  const stays = space.totalBytes - space.freeBytes;
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <span className="font-display text-figure leading-none font-title tabular-nums">
          {sizeText(space.freeBytes)}
        </span>
        <span className="text-muted-foreground">
          {t("overview.clean.freeing", { total: sizeText(space.totalBytes), count: accounts })}
        </span>
      </p>
      <StorageBar
        summary={t("overview.clean.summary", { total: sizeText(space.totalBytes) })}
        segments={[
          {
            id: "keep",
            label: t("overview.clean.keep"),
            value: stays,
            size: sizeText(stays),
            pattern: "solid",
          },
          {
            id: "clean",
            label: t("overview.clean.free"),
            value: space.freeBytes,
            size: sizeText(space.freeBytes),
            pattern: "hatched",
          },
        ]}
      />
    </>
  );
}
