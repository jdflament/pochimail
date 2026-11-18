import { Button } from "@pochimail/ui/components/button";
import { getLocale, t } from "@pochimail/ui/i18n/format.ts";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";

export function WelcomePage() {
  const client = useWorkerClient();
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });
  const device = deviceLabel(deviceName.data ?? "device", getLocale());

  return (
    <>
      <h1 className="text-balance text-[40px] leading-tight">{t("welcome.headline")}</h1>
      <p className="mt-6 text-pretty text-base leading-relaxed text-muted-foreground">
        {t("welcome.description", { device })}
      </p>
      <Button asChild size="lg" className="mt-8 w-full max-w-[26rem]">
        <Link to="/connect">{t("welcome.cta")}</Link>
      </Button>
      <p className="mt-4 text-sm text-foreground-tertiary">{t("welcome.openSource")}</p>
    </>
  );
}
