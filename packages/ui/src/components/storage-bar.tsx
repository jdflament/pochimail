import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

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
  const description = `${summary}: ${segments.map((s) => `${s.size} ${s.label}`).join(", ")}`;

  return (
    <div data-slot="storage-bar" className={cn("flex flex-col gap-3", className)} {...props}>
      <div role="img" aria-label={description} className="flex h-3 gap-[3px]">
        {segments.map((s, i) => (
          <span
            key={s.id}
            data-slot="storage-segment"
            data-pattern={s.pattern}
            style={{ flex: `${s.value} 1 0` }}
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
              {s.label} · {s.size}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { StorageBar, type StorageBarProps, type StorageSegment, segmentVariants };
