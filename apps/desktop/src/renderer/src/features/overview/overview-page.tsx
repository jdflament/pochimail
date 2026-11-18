import { getLocale, t } from "@pochimail/ui/i18n/format.ts";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";

export function OverviewPage() {
  const client = useWorkerClient();
  const appState = useQuery({
    queryKey: queryKeys.appState(),
    queryFn: () => client.call("app.state"),
  });
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });

  const device = deviceLabel(deviceName.data ?? "device", getLocale());
  const status =
    appState.isPending || deviceName.isPending
      ? t("overview.worker.connecting")
      : appState.isError || deviceName.isError
        ? t("overview.worker.unavailable")
        : appState.data.status === "ready"
          ? t("overview.worker.ready")
          : t("overview.worker.unavailable");

  return (
    <main className="mx-auto max-w-2xl px-8 pt-16">
      <h1 className="text-4xl">{t("overview.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("overview.privacy")}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("overview.promise.device", { device })}
      </p>
      <p role="status" aria-live="polite" className="mt-8 text-sm text-foreground-tertiary">
        {status}
      </p>
      <p className="mt-2 text-sm text-foreground-tertiary">{t("overview.sorting", { device })}</p>
    </main>
  );
}
