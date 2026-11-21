import { cn } from "@pochimail/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type * as React from "react";

type ProviderButtonProps = React.ComponentProps<"button"> & {
  logo: React.ReactNode;
  children: React.ReactNode;
};

/** A "Continue with <provider>" row: logo, label, chevron (Connect.html). */
export function ProviderButton({ logo, children, className, ...props }: ProviderButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-13 w-full items-center gap-3.5 rounded-lg bg-card px-4 text-left text-body leading-natural font-medium text-card-foreground ring-1 ring-inset ring-border outline-none transition-colors duration-(--duration-press) hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex size-6.5 items-center justify-center">
        {logo}
      </span>
      {children}
      <ChevronRight
        aria-hidden="true"
        strokeWidth={1.8}
        className="ml-auto size-4 text-foreground-tertiary"
      />
    </button>
  );
}
