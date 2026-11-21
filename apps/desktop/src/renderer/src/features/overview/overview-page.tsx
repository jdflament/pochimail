import type { CleanUpKind } from "@pochimail/cleanup/policies/clean-up-actions";
import { Button } from "@pochimail/ui/components/button";
import { EmptyState } from "@pochimail/ui/components/empty-state";
import { Skeleton } from "@pochimail/ui/components/skeleton";
import { StatusStrip } from "@pochimail/ui/components/status-strip";
import { type T, useLocale, useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";
import { CatchSection } from "./catch-section.tsx";
import { CleanUpSection } from "./clean-up-section.tsx";
import { cleanUpView, overviewView } from "./overview-figures.ts";
import { type ScanStatus, useScanStatus } from "./use-scan-status.ts";

const scanStatusLine = (scan: ScanStatus, t: T): string => {
  if (scan.paused) return t("overview.scan.paused");
  if (scan.total === null) return t("overview.scan.progressNoTotal", { processed: scan.processed });
  return t("overview.scan.progress", { processed: scan.processed, total: scan.total });
};

export function OverviewPage() {
  const t = useT();
  const client = useWorkerClient();
  const navigate = useNavigate();
  const { account } = useSearch({ strict: false });
  const accounts = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => client.call("accounts.list"),
  });
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });
  const overview = useQuery({
    queryKey: queryKeys.overview(account),
    queryFn: () => client.call("overview.get", account === undefined ? {} : { accountId: account }),
  });
  const scopedAccounts = (accounts.data ?? []).filter(
    (a) => account === undefined || a.id === account,
  );
  const scan = useScanStatus(scopedAccounts.map((a) => a.id));

  const locale = useLocale();
  const device = deviceLabel(deviceName.data ?? "device", locale);
  const data = overview.data;
  const review = (category: string, kind?: CleanUpKind) =>
    void navigate({
      to: "/category/$categoryId",
      params: { categoryId: category },
      search: (prev) => (kind === undefined ? prev : { ...prev, review: kind }),
    });

  const view = overviewView(data, scan.active, overview.isError);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-8 pt-8 pb-16">
      {scan.active ? (
        <StatusStrip
          progress={scan.percent}
          headline={t("overview.sorting", { device })}
          status={scanStatusLine(scan, t)}
        >
          <Button variant="secondary" size="sm" onClick={scan.paused ? scan.resume : scan.pause}>
            {scan.paused ? t("overview.resume") : t("overview.pause")}
          </Button>
        </StatusStrip>
      ) : null}

      <header className="flex flex-wrap items-baseline gap-x-4">
        <h1 className="text-4xl">{t("overview.title")}</h1>
        {accounts.data ? (
          <span className="text-muted-foreground">
            {t("overview.accounts", { count: scopedAccounts.length })}
          </span>
        ) : null}
      </header>

      {view === "loading" && (
        <div role="status" aria-label={t("overview.loading")} className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      )}
      {view === "error" && (
        <EmptyState
          title={t("overview.worker.unavailable")}
          action={{ label: t("overview.retry"), onClick: () => void overview.refetch() }}
        />
      )}
      {view === "empty" && (
        <EmptyState
          title={t("overview.empty.title")}
          description={t("overview.empty.description")}
          action={{
            label: t("overview.empty.action"),
            onClick: () => void navigate({ to: "/connect" }),
          }}
        />
      )}
      {view === "content" && data !== undefined && (
        <>
          <CleanUpSection
            view={cleanUpView(data)}
            accounts={scopedAccounts.length}
            sizeProvider={
              scopedAccounts.some((a) => a.provider === "microsoft") ? "microsoft" : "google"
            }
            onReview={review}
          />
          <CatchSection data={data} onReview={() => review("people")} />
        </>
      )}
    </main>
  );
}
