import { useMotionEnabled } from "@pochimail/ui/hooks/use-motion";
import { t } from "@pochimail/ui/i18n/format.ts";
import { MOTION, MOTION_EASE } from "@pochimail/ui/lib/motion";
import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const segmentVariants = cva("", {
  variants: {
    // Solid = worth keeping, hatched = can be cleaned. The hatch keeps the meaning without color alone.
    pattern: {
      solid: "bg-primary",
      hatched:
        "bg-[repeating-linear-gradient(135deg,var(--foreground-tertiary)_0_3px,var(--muted)_3px_7px)]",
    },
  },
  defaultVariants: { pattern: "solid" },
});

type StorageSegment = {
  id: string;
  label: string;
  /** Relative weight; only ratios matter. */
  value: number;
  /** Already formatted size, e.g. "3.3 GB". */
  size: string;
  pattern: NonNullable<VariantProps<typeof segmentVariants>["pattern"]>;
};

type StorageBarProps = Omit<React.ComponentProps<"div">, "children"> & {
  segments: StorageSegment[];
  /** Spoken summary prefix, e.g. "6.4 GB used". */
  summary: string;
};

function StorageBar({ className, segments, summary, ...props }: StorageBarProps) {
  const motion = useMotionEnabled();
  // Fills once on mount (keep segment, then the hatched one 140ms later); later value changes (after a cleanup) glide the same way.
  const [settled, setSettled] = React.useState(!motion);
  React.useEffect(() => {
    if (!motion) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [motion]);
  const description = t("storageBar.description", {
    summary,
    items: segments
      .map((s) => t("storageBar.descriptionItem", { size: s.size, label: s.label }))
      .join(t("storageBar.itemSeparator")),
  });

  return (
    <div data-slot="storage-bar" className={cn("flex flex-col gap-3", className)} {...props}>
      <div role="img" aria-label={description} className="flex h-3 gap-[3px]">
        {segments.map((s, i) => (
          <span
            key={s.id}
            data-slot="storage-segment"
            data-pattern={s.pattern}
            style={{
              flex: `${settled || !motion ? s.value : 0} 1 0`,
              ...(motion
                ? {
                    transition: `flex-grow ${MOTION.storageBarMs}ms ${MOTION_EASE} ${s.pattern === "hatched" ? MOTION.storageBarHatchedDelayMs : 0}ms`,
                  }
                : {}),
            }}
            className={cn(
              segmentVariants({ pattern: s.pattern }),
              "rounded-[3px]",
              i === 0 && "rounded-l-full",
              i === segments.length - 1 && "rounded-r-full",
            )}
          />
        ))}
      </div>
      <ul
        data-slot="storage-legend"
        className="m-0 flex list-none flex-wrap gap-x-[18px] gap-y-1.5 p-0 text-[13px] text-muted-foreground"
      >
        {segments.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                segmentVariants({ pattern: s.pattern }),
                "size-2.5 shrink-0 rounded-[3px]",
              )}
            />
            <span className="break-words">
              {t("storageBar.legendItem", { label: s.label, size: s.size })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { StorageBar, type StorageBarProps, type StorageSegment, segmentVariants };
