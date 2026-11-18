import { Button } from "@pochimail/ui/components/button";
import { cn } from "@pochimail/ui/lib/utils";
import { Slot } from "radix-ui";
import type * as React from "react";

type RecommendationRowProps = Omit<React.ComponentProps<"li">, "children"> & {
  asChild?: boolean;
  /** What Pochi proposes, as a sentence. */
  sentence: React.ReactNode;
  /** Why, in one line. */
  reason?: React.ReactNode;
  /** Already formatted size, e.g. "1.2 GB". */
  size?: string;
  onReview?: () => void;
  reviewLabel: string;
};

function RecommendationRow({
  className,
  asChild = false,
  sentence,
  reason,
  size,
  onReview,
  reviewLabel,
  ...props
}: RecommendationRowProps) {
  const Comp = asChild ? Slot.Root : "li";

  return (
    <Comp
      data-slot="recommendation-row"
      className={cn(
        "@container grid list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[18px] gap-y-1 py-3.5 @[560px]:grid-cols-[minmax(0,1fr)_auto_auto]",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-[15px] font-medium">{sentence}</span>
        {reason ? (
          <span className="break-words text-[13px] text-muted-foreground">{reason}</span>
        ) : null}
      </span>
      {size ? (
        <span
          data-slot="recommendation-size"
          className="col-start-1 row-start-2 text-sm whitespace-nowrap text-muted-foreground tabular-nums @[560px]:col-start-auto @[560px]:row-start-auto"
        >
          {size}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        data-slot="recommendation-review"
        className="col-start-2 row-start-1 bg-accent @[560px]:col-start-auto @[560px]:row-start-auto"
        onClick={onReview}
      >
        {reviewLabel}
      </Button>
    </Comp>
  );
}

export { RecommendationRow, type RecommendationRowProps };
