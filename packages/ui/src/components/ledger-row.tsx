import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const ledgerBarVariants = cva("h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted", {
  variants: {
    // The fill color: one per mail category (brief §6), or the neutral default.
    tone: {
      neutral: "[&>span]:bg-foreground-tertiary",
      people: "[&>span]:bg-category-people",
      records: "[&>span]:bg-category-records",
      purchases: "[&>span]:bg-category-purchases",
      signins: "[&>span]:bg-category-signins",
      notifications: "[&>span]:bg-category-notifications",
      newsletters: "[&>span]:bg-category-newsletters",
      promotions: "[&>span]:bg-category-promotions",
    },
  },
  defaultVariants: { tone: "neutral" },
});

type LedgerRowProps = Omit<React.ComponentProps<"li">, "children"> &
  VariantProps<typeof ledgerBarVariants> & {
    asChild?: boolean;
    label: React.ReactNode;
    /** Number of emails; formatted with `locale`. */
    count: number;
    /** Already formatted size, e.g. "1.2 GB". */
    size?: string;
    /** 0 to 1: shows the proportional bar (hidden when the row is narrower than 760px). */
    share?: number | undefined;
    locale?: string;
  };

function LedgerRow({
  className,
  asChild = false,
  label,
  count,
  size,
  share,
  tone,
  locale,
  ...props
}: LedgerRowProps) {
  const Comp = asChild ? Slot.Root : "li";
  const pct = share === undefined ? undefined : Math.round(Math.min(1, Math.max(0, share)) * 100);

  return (
    <Comp data-slot="ledger-row" className={cn("@container list-none", className)} {...props}>
      <div className="flex min-h-8 items-baseline gap-3 py-1.5 text-[15px]">
        <span data-slot="ledger-label" className="min-w-0 break-words font-medium">
          {label}
        </span>
        <span
          aria-hidden="true"
          data-slot="ledger-leader"
          className="min-w-4 flex-1 translate-y-[-3px] self-end border-b border-dotted border-foreground-tertiary"
        />
        <span data-slot="ledger-count" className="shrink-0 tabular-nums">
          {count.toLocaleString(locale)}
        </span>
        {size ? (
          <span
            data-slot="ledger-size"
            className="shrink-0 text-sm text-muted-foreground tabular-nums"
          >
            {size}
          </span>
        ) : null}
        {pct === undefined ? null : (
          <span
            aria-hidden="true"
            data-slot="ledger-bar"
            data-share={pct}
            className={cn(ledgerBarVariants({ tone }), "hidden self-center @[760px]:block")}
          >
            <span className="block h-full rounded-full" style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
    </Comp>
  );
}

export { LedgerRow, type LedgerRowProps, ledgerBarVariants };
