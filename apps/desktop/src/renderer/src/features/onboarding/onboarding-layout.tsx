import { Mascot } from "@pochimail/ui/components/mascot";
import { t } from "@pochimail/ui/i18n/format.ts";
import { cn } from "@pochimail/ui/lib/utils";
import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/** Onboarding screens in order; the step indicator shows on these only. */
const ONBOARDING_PATHS = ["/welcome", "/connect", "/setup"] as const;

/**
 * Shared frame for the onboarding screens. It stays mounted while the route changes, so Pochi and the
 * step indicator keep their place and only the content below slides in (docs/design.md, Screen to screen).
 */
export function OnboardingLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const index = (ONBOARDING_PATHS as readonly string[]).indexOf(pathname);
  const current = Math.max(index, 0) + 1;
  const total = ONBOARDING_PATHS.length;
  const router = useRouter();
  const content = useRef<HTMLDivElement>(null);

  // The previous screen's focused control unmounts on navigation: once the new screen has rendered,
  // move focus to its title.
  useEffect(
    () =>
      router.subscribe("onRendered", ({ pathChanged }) => {
        if (!pathChanged) return;
        const heading = content.current?.querySelector("h1");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus();
      }),
    [router],
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex justify-center pt-6">
        <ol
          aria-label={t("onboarding.progress", { current, total })}
          className="m-0 flex list-none items-center gap-1.5 p-0"
        >
          {ONBOARDING_PATHS.map((path, position) => (
            <li
              key={path}
              aria-current={position + 1 === current ? "step" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                position + 1 === current ? "w-8 bg-foreground" : "w-1.5 bg-border",
              )}
            />
          ))}
        </ol>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-8 pb-16">
        <Mascot size="lg" />
        <div
          key={pathname}
          ref={content}
          className="animate-screen-in motion-reduce:animate-none mt-8 flex w-full flex-col items-center text-center [&_h1]:outline-none"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
