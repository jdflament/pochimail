import { cn } from "@pochimail/ui/lib/utils";
import type * as React from "react";

type OnboardingStepperProps = Omit<React.ComponentProps<"ol">, "children"> & {
  /** Total number of onboarding steps. */
  total: number;
  /** Active step, 1-based. */
  current: number;
  /** Accessible name for the whole indicator, e.g. "Step 1 of 3" (from the catalog). */
  label: string;
};

// Step indicator (docs/design.md, Motion: Screen to screen): the active step stretches into a pill.
function OnboardingStepper({ total, current, label, className, ...props }: OnboardingStepperProps) {
  return (
    <ol
      data-slot="onboarding-stepper"
      aria-label={label}
      className={cn("m-0 flex list-none items-center gap-1.5 p-0", className)}
      {...props}
    >
      {Array.from({ length: total }, (_, index) => index + 1).map((step) => {
        const active = step === current;
        return (
          <li
            key={step}
            data-slot="onboarding-step"
            data-state={active ? "active" : "inactive"}
            aria-current={active ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-[220ms] ease-out motion-reduce:transition-none",
              active ? "w-8 bg-foreground" : "w-1.5 bg-border",
            )}
          />
        );
      })}
    </ol>
  );
}

export { OnboardingStepper, type OnboardingStepperProps };
