import { Mascot } from "@pochimail/ui/components/mascot";
import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
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
  const t = useT();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const index = (ONBOARDING_PATHS as readonly string[]).indexOf(pathname);
  const current = Math.max(index, 0) + 1;
  const total = ONBOARDING_PATHS.length;
  const router = useRouter();
  // Setup shows Pochi inside its speech bubble and needs room for the card rows.
  const isSetup = pathname === "/setup";
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
    <div className="@container flex min-h-screen flex-col">
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
                "h-1.5 rounded-full transition-[width,background-color] duration-(--duration-panel) ease-(--ease-out) motion-reduce:transition-none",
                position + 1 === current ? "w-5 bg-foreground" : "w-1.5 bg-border",
              )}
            />
          ))}
        </ol>
      </header>
      <main
        className={cn(
          "mx-auto flex w-full flex-1 flex-col items-center justify-center gap-4.5 px-4 pb-12 @phone:px-8",
          isSetup ? "max-w-5xl" : "max-w-xl",
        )}
      >
        {isSetup ? null : <Mascot size="lg" />}
        <div
          key={pathname}
          ref={content}
          className={cn(
            "animate-screen-in motion-reduce:animate-none flex w-full flex-col items-center text-center [&_h1]:rounded-md [&_h1]:outline-none [&_h1]:focus-visible:ring-2 [&_h1]:focus-visible:ring-ring [&_h1]:focus-visible:ring-offset-2 [&_h1]:focus-visible:ring-offset-background",
          )}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}
