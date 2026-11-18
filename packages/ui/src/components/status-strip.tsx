import { Button } from "@pochimail/ui/components/button";
import { cn } from "@pochimail/ui/lib/utils";
import { LockIcon } from "lucide-react";
import type * as React from "react";

type StatusStripProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** 0 to 100. */
  progress: number;
  /** Privacy reassurance, e.g. "Sorting privately on this Mac". */
  headline: string;
  /** What Pochi just did, e.g. "Labeled 214 emails as Job search". */
  status?: string;
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  onViewSummary?: () => void;
  labels?: { pause: string; resume: string; viewSummary: string };
};

const defaultLabels = { pause: "Pause", resume: "Resume", viewSummary: "View summary" };

function StatusStrip({
  className,
  progress,
  headline,
  status,
  paused = false,
  onPausedChange,
  onViewSummary,
  labels = defaultLabels,
  ...props
}: StatusStripProps) {
  const pct = Math.round(Math.min(100, Math.max(0, progress)));

  return (
    <div
      data-slot="status-strip"
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    >
      <div aria-hidden="true" className="h-0.5 bg-muted">
        <div
          data-slot="status-progress"
          className="h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <LockIcon aria-hidden="true" className="size-[15px] shrink-0" />
          {headline}
        </span>
        <span className="tabular-nums">{pct}%</span>
        {status ? <span className="break-words">{status}</span> : null}
        <span className="ml-auto flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            data-slot="status-toggle"
            onClick={() => onPausedChange?.(!paused)}
          >
            {paused ? labels.resume : labels.pause}
          </Button>
          <Button size="sm" data-slot="status-summary" onClick={onViewSummary}>
            {labels.viewSummary}
          </Button>
        </span>
      </div>
    </div>
  );
}

export { StatusStrip, type StatusStripProps };
