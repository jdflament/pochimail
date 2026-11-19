import { Button } from "@pochimail/ui/components/button";
import { useLocale, useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { deviceLabel } from "@pochimail/ui/i18n/locale.ts";
import { cn } from "@pochimail/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";

export function WelcomePage() {
  const t = useT();
  const locale = useLocale();
  const client = useWorkerClient();
  const deviceName = useQuery({
    queryKey: queryKeys.deviceName(),
    queryFn: () => client.call("device.name"),
  });
  const device = deviceLabel(deviceName.data ?? "device", locale);

  return (
    <>
      <h1 className="text-balance text-display leading-tight">{t("welcome.headline")}</h1>
      {/* Held invisible until the device name resolves, so the copy never flips from "device" to "Mac". */}
      <p
        className={cn(
          "mt-6 text-pretty text-base leading-relaxed text-muted-foreground",
          deviceName.isPending && "invisible",
        )}
      >
        {t("welcome.description", { device })}
      </p>
      <Button asChild size="lg" className="mt-8 w-full max-w-104">
        <Link to="/connect">{t("welcome.cta")}</Link>
      </Button>
      <p className="mt-4 text-sm text-foreground-tertiary">{t("welcome.openSource")}</p>
    </>
  );
}
