import type { DeviceName } from "@pochimail/core/ports/platform";
import { getLocale, t } from "@pochimail/ui/i18n/format.ts";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { useEffect, useState } from "react";
import { connectWorker } from "../../lib/worker.ts";

type WorkerState = "connecting" | "connected" | "unavailable";
type State = { readonly worker: WorkerState; readonly device: DeviceName };

export function OverviewPage() {
  const [state, setState] = useState<State>({ worker: "connecting", device: "computer" });

  useEffect(() => {
    let cancelled = false;
    void connectWorker()
      .then(async (client) => {
        const [reply, device] = await Promise.all([
          client.call("app.state"),
          client.call("device.name"),
        ]);
        if (!cancelled)
          setState({ worker: reply.status === "ready" ? "connected" : "unavailable", device });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, worker: "unavailable" }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status =
    state.worker === "connecting"
      ? t("overview.worker.connecting")
      : state.worker === "connected"
        ? t("overview.worker.ready")
        : t("overview.worker.unavailable");
  const device = deviceLabel(state.device, getLocale());

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
