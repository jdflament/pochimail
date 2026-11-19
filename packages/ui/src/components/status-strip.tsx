import { MOTION, transition } from "@pochimail/ui/lib/motion";
import { cn } from "@pochimail/ui/lib/utils";
import { LockIcon } from "lucide-react";
import type * as React from "react";

type StatusRegionProps = Omit<React.ComponentProps<"div">, "role" | "aria-live">;

/**
 * The one quiet, polite live region (and its text style) that both renderings below compose. It
 * stays mounted: render it always and change its children, because a region inserted on demand is
 * often not announced.
 */
function StatusRegion({ className, ...props }: StatusRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center gap-x-4 text-caption text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

type StatusLineProps = StatusRegionProps;

/** A quiet line in the page flow (never a pop-up): the live region alone, framed while it has content. */
function StatusLine({ className, children, ...props }: StatusLineProps) {
  return (
    <StatusRegion
      data-slot="status-line"
      className={cn("gap-y-2", children && "border-y border-border py-2.5", className)}
      {...props}
    >
      {children}
    </StatusRegion>
  );
}

type StatusStripProps = React.ComponentProps<"div"> & {
  /** 0 to 100. */
  progress: number;
  /** Privacy reassurance, e.g. "Sorting privately on this Mac". */
  headline: string;
  /** What Pochi just did, e.g. "Labeled 214 emails as Job search". */
  status?: string;
  /** Action buttons rendered by the caller (e.g. Pause/Resume, View summary). */
  children?: React.ReactNode;
};

function StatusStrip({
  className,
  progress,
  headline,
  status,
  children,
  ...props
}: StatusStripProps) {
  const pct = Math.round(Math.min(100, Math.max(0, progress)));

  return (
    <div data-slot="status-strip" className={cn("flex flex-col gap-2.5", className)} {...props}>
      <div aria-hidden="true" className="h-0.5 bg-muted">
        <div
          data-slot="status-progress"
          className="h-full bg-primary"
          style={{
            width: `${pct}%`,
            transition: transition({ property: "width", ms: MOTION.progressMs }),
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <StatusRegion className="flex-1 gap-y-2.5">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <LockIcon aria-hidden="true" className="size-3.75 shrink-0" />
            {headline}
          </span>
          <span className="tabular-nums">{pct}%</span>
          {status ? (
            // Keyed so each new finding slides up 8px and fades in, replacing the previous one.
            <span
              key={status}
              data-slot="status-finding"
              className="animate-finding-in break-words"
            >
              {status}
            </span>
          ) : null}
        </StatusRegion>
        {children ? <div className="ml-auto flex gap-1.5">{children}</div> : null}
      </div>
    </div>
  );
}

export { StatusLine, type StatusLineProps, StatusStrip, type StatusStripProps };
