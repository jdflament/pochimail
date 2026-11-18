import { cn } from "@pochimail/ui/lib/utils";
import { LockIcon } from "lucide-react";
import type * as React from "react";

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
          className="h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[13px] text-muted-foreground">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2.5"
        >
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <LockIcon aria-hidden="true" className="size-[15px] shrink-0" />
            {headline}
          </span>
          <span className="tabular-nums">{pct}%</span>
          {status ? <span className="break-words">{status}</span> : null}
        </div>
        {children ? <div className="ml-auto flex gap-1.5">{children}</div> : null}
      </div>
    </div>
  );
}

export { StatusStrip, type StatusStripProps };
