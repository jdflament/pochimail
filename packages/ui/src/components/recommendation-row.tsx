import { Button } from "@pochimail/ui/components/button";
import { MOTION, MOTION_FADE_EASE, transition } from "@pochimail/ui/lib/motion";
import { cn } from "@pochimail/ui/lib/utils";
import type * as React from "react";

type RecommendationRowProps = Omit<React.ComponentProps<"li">, "children"> & {
  /** What Pochi proposes, as a sentence. */
  sentence: React.ReactNode;
  /** Why, in one line. */
  reason?: React.ReactNode;
  /** Already formatted size, e.g. "1.2 GB". */
  size?: string;
  onReview?: () => void;
  reviewLabel: string;
  /** Folds the row away (height 260ms + fade 200ms) instead of removing it, so Undo can unfold it. Hidden from assistive tech and focus while folded. */
  folded?: boolean;
};

function RecommendationRow({
  className,
  sentence,
  reason,
  size,
  onReview,
  reviewLabel,
  folded = false,
  style,
  ...props
}: RecommendationRowProps) {
  return (
    <li
      data-slot="recommendation-row"
      data-folded={folded ? "true" : undefined}
      style={{
        transition: transition(
          { property: "height", ms: MOTION.rowFoldMs },
          { property: "padding-block", ms: MOTION.rowFoldMs },
          { property: "opacity", ms: MOTION.rowFadeMs, ease: MOTION_FADE_EASE },
        ),
        ...style,
      }}
      inert={folded}
      aria-hidden={folded ? true : undefined}
      className={cn(
        // Real height transition (not a max-height guess): `interpolate-size` lets height animate between auto and 0.
        "h-auto overflow-hidden [interpolate-size:allow-keywords]",
        "@container grid list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4.5 gap-y-1 py-3.5 @phone:grid-cols-[minmax(0,1fr)_auto_auto]",
        className,
        folded && "h-0 py-0 opacity-0",
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-body font-medium">{sentence}</span>
        {reason ? (
          <span className="break-words text-caption text-muted-foreground">{reason}</span>
        ) : null}
      </span>
      {size ? (
        <span
          data-slot="recommendation-size"
          className="col-start-1 row-start-2 text-ui whitespace-nowrap text-muted-foreground tabular-nums @phone:col-start-auto @phone:row-start-auto"
        >
          {size}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        data-slot="recommendation-review"
        className="col-start-2 row-start-1 bg-accent @phone:col-start-auto @phone:row-start-auto"
        onClick={onReview}
      >
        {reviewLabel}
      </Button>
    </li>
  );
}

export { RecommendationRow, type RecommendationRowProps };
