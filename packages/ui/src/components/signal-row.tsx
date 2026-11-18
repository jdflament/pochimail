import { Button } from "@pochimail/ui/components/button";
import { cn } from "@pochimail/ui/lib/utils";
import { Slot } from "radix-ui";
import type * as React from "react";

type SignalRowProps = Omit<React.ComponentProps<"li">, "children"> & {
  asChild?: boolean;
  /** The large figure, e.g. 7 or <CountUp value={7} />. */
  figure: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  onReview?: () => void;
  reviewLabel: string;
};

function SignalRow({
  className,
  asChild = false,
  figure,
  title,
  detail,
  onReview,
  reviewLabel,
  ...props
}: SignalRowProps) {
  const Comp = asChild ? Slot.Root : "li";

  return (
    <Comp
      data-slot="signal-row"
      className={cn(
        "@container grid list-none grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 @[480px]:grid-cols-[4.5rem_minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    >
      <span
        data-slot="signal-figure"
        className="font-display text-[28px] leading-none font-[450] tracking-[-0.02em] tabular-nums @[480px]:text-[32px]"
      >
        {figure}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words text-[15px] font-medium">{title}</span>
        {detail ? (
          <span className="break-words text-[13px] text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <Button variant="link" size="sm" data-slot="signal-review" onClick={onReview}>
        {reviewLabel}
      </Button>
    </Comp>
  );
}

export { SignalRow, type SignalRowProps };
