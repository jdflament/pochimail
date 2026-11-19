import { cn } from "@pochimail/ui/lib/utils";
import type * as React from "react";

type StatusLineProps = Omit<React.ComponentProps<"div">, "role">;

/**
 * A quiet line in the page flow (never a pop-up). It is a polite live region that stays mounted:
 * render it always and change its children, because a region inserted on demand is often not announced.
 */
function StatusLine({ className, children, ...props }: StatusLineProps) {
  return (
    <div
      data-slot="status-line"
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground",
        children && "border-y border-border py-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { StatusLine, type StatusLineProps };
