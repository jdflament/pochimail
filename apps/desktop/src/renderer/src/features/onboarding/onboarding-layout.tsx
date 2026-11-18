import { Mascot } from "@pochimail/ui/components/mascot";
import { OnboardingStepper } from "@pochimail/ui/components/onboarding-stepper";
import { t } from "@pochimail/ui/i18n/format.ts";
import { Outlet, useRouterState } from "@tanstack/react-router";

/** Onboarding screens in order; the stepper shows on these only. */
const ONBOARDING_PATHS = ["/welcome", "/connect", "/setup"] as const;

/**
 * Shared frame for the onboarding screens. It stays mounted while the route changes, so Pochi and the
 * stepper keep their place and only the content below slides in (docs/design.md, Screen to screen).
 */
export function OnboardingLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const index = (ONBOARDING_PATHS as readonly string[]).indexOf(pathname);
  const current = Math.max(index, 0) + 1;
  const total = ONBOARDING_PATHS.length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex justify-center pt-6">
        <OnboardingStepper
          total={total}
          current={current}
          label={t("onboarding.progress", { current, total })}
        />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-8 pb-16">
        <Mascot size="lg" />
        <div
          key={pathname}
          data-slot="screen-content"
          className="animate-screen-in motion-reduce:animate-none mt-8 flex w-full flex-col items-center text-center"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
