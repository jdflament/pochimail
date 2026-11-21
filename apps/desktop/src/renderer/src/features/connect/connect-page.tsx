import googleLogo from "@pochimail/ui/assets/providers/google.svg";
import microsoftLogo from "@pochimail/ui/assets/providers/microsoft.svg";
import { useLocale, useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";
import { ProviderButton } from "./provider-button.tsx";

const PROMISES = ["local", "control", "delete"] as const;

export function ConnectPage() {
  const t = useT();
  const locale = useLocale();
  const client = useWorkerClient();
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });
  const device = deviceLabel(deviceName.data ?? "device", locale);

  return (
    <div className="flex w-full max-w-220 flex-wrap items-center justify-center gap-8 text-left @desktop:gap-16">
      <div className="flex flex-[1_1_21.25rem] flex-col gap-4">
        <h1 className="text-title-sm leading-natural @phone:text-title">{t("connect.title")}</h1>
        <p className="text-body leading-copy text-muted-foreground">{t("connect.description")}</p>
        <div className="flex flex-col gap-2.5">
          <ProviderButton logo={<img src={googleLogo} alt="" width={20} height={20} />}>
            {t("connect.google")}
          </ProviderButton>
          <ProviderButton logo={<img src={microsoftLogo} alt="" width={18} height={18} />}>
            {t("connect.microsoft")}
          </ProviderButton>
        </div>
      </div>
      <div className="flex flex-[1_1_18.75rem] flex-col">
        <h2 className="mb-1.5 text-section leading-natural font-semibold">
          {t("connect.promises")}
        </h2>
        <ul className="m-0 list-none border-b border-border p-0">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex flex-col gap-0.5 border-t border-border py-3.5">
              <span className="text-body leading-natural font-semibold">
                {t(`connect.promise.${promise}.title`, { device })}
              </span>
              <span className="text-ui leading-normal text-muted-foreground">
                {t(`connect.promise.${promise}.body`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
