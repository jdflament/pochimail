import { RadioGroupItem } from "@pochimail/ui/components/radio-group";
import { cn } from "@pochimail/ui/lib/utils";
import * as React from "react";

type RadioCardProps = Omit<React.ComponentProps<typeof RadioGroupItem>, "children" | "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small pill after the title, e.g. "Recommended" on Suggest. Text, so it is read aloud and translatable. */
  badge?: React.ReactNode;
};

// Use inside a RadioGroup. The card is the label for the real radio, so arrow keys, roving focus and announcements come from Radix.
function RadioCard({ className, title, description, badge, id, ...props }: RadioCardProps) {
  const uid = React.useId();
  const radioId = id ?? uid;
  const titleId = `${radioId}-title`;
  const descriptionId = `${radioId}-description`;

  return (
    <label
      data-slot="radio-card"
      htmlFor={radioId}
      className={cn(
        "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl bg-card py-3 pr-4 pl-4 text-left shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-(--duration-press) has-[[data-state=checked]]:shadow-[0_0_0_2px_var(--primary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 motion-reduce:transition-none",
        className,
      )}
    >
      <RadioGroupItem
        id={radioId}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="size-5"
        {...props}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          <span id={titleId} className="break-words">
            {title}
          </span>
          {badge ? (
            <span
              data-slot="radio-card-badge"
              className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
            >
              {badge}
            </span>
          ) : null}
        </span>
        {description ? (
          <span
            id={descriptionId}
            className="text-sm leading-snug break-words text-muted-foreground"
          >
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export { RadioCard, type RadioCardProps };
