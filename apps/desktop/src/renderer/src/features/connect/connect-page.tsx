import { Button } from "@pochimail/ui/components/button";
import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { OutputOf } from "#shared/ipc/contract.ts";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";
import { ConnectPromises } from "./connect-promises.tsx";
import googleLogo from "./google.svg";
import microsoftLogo from "./microsoft.svg";

const providerButton = "h-13 w-full justify-start gap-3.5 rounded-xl bg-card px-4 text-body";

type Outcome = OutputOf<"accounts.connect">;

/** The copy key of the one line shown after a sign-in that did not connect; `undefined` while there is nothing to explain. */
const problemKey = (outcome: Outcome | undefined, threw: boolean) => {
  if (threw) return "connect.failed";
  if (outcome?.status === "cancelled") return "connect.cancelled";
  if (outcome?.status !== "failed") return undefined;
  if (outcome.reason === "not-configured") return "connect.notConfigured";
  return outcome.reason === "no-address" ? "connect.noAddress" : "connect.failed";
};

/** Connect: sign in with the provider in the system browser. No token ever reaches this screen, only the outcome. */
export function ConnectPage() {
  const t = useT();
  const client = useWorkerClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });

  const connect = useMutation({
    mutationFn: async () => {
      // Adding an account to an existing setup skips Setup (the choices are already made).
      // Both calls leave at once: the port keeps order, so a Cancel pressed right away reaches the worker after the
      // connect has started (awaiting the list first let it arrive early, find nothing to cancel, and hang the sign-in).
      const listing = client.call("accounts.list");
      const connecting = client.call("accounts.connect", { provider: "google" });
      // The connect outcome is the truth: a failed list only means "treat it as a first account".
      const [existing, outcome] = await Promise.allSettled([listing, connecting]);
      if (outcome.status === "rejected") throw outcome.reason;
      return {
        outcome: outcome.value,
        firstAccount: existing.status === "rejected" || existing.value.length === 0,
      };
    },
    onSuccess: async ({ outcome, firstAccount }) => {
      if (outcome.status !== "connected") return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.appState() });
      await navigate({ to: firstAccount ? "/setup" : "/overview" });
    },
  });

  const cancel = useMutation({ mutationFn: () => client.call("accounts.cancelConnect") });
  const key = problemKey(connect.isError ? undefined : connect.data?.outcome, connect.isError);

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-16">
      <div className="flex flex-1 basis-85 flex-col gap-4 text-left">
        <h1 className="text-balance text-title leading-tight">{t("connect.title")}</h1>
        <p className="text-body leading-relaxed text-muted-foreground">
          {t("connect.description")}
        </p>
        {key === undefined ? (
          <div className="flex flex-col gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              className={providerButton}
              disabled={connect.isPending}
              onClick={() => connect.mutate()}
            >
              <img src={googleLogo} alt="" width={20} height={20} />
              {t("connect.google")}
              <ChevronRightIcon className="ml-auto text-foreground-tertiary" aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="lg" className={providerButton} disabled>
              <img src={microsoftLogo} alt="" width={18} height={18} />
              {t("connect.microsoft")}
              <span className="ml-auto text-caption font-normal text-foreground-tertiary">
                {t("connect.comingSoon")}
              </span>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4">
            <p role="alert" className="text-body">
              {t(key)}
            </p>
            <Button size="lg" disabled={connect.isPending} onClick={() => connect.mutate()}>
              {t("connect.retry")}
            </Button>
          </div>
        )}
        <div className="flex min-h-8 items-center gap-3">
          <p role="status" className="text-caption text-foreground-tertiary">
            {connect.isPending ? t("connect.waiting") : t("connect.imap")}
          </p>
          {connect.isPending ? (
            <Button variant="secondary" size="sm" onClick={() => cancel.mutate()}>
              {t("connect.cancel")}
            </Button>
          ) : null}
        </div>
      </div>
      <ConnectPromises device={deviceName.data ?? "device"} />
    </div>
  );
}
