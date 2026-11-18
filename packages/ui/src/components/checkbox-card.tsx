import { Checkbox } from "@pochimail/ui/components/checkbox";
import { cn } from "@pochimail/ui/lib/utils";
import * as React from "react";

type CheckboxCardProps = Omit<React.ComponentProps<typeof Checkbox>, "children" | "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
};

// The whole card is the label: clicking anywhere toggles the real checkbox, which keeps its own role, state and keyboard handling.
function CheckboxCard({ className, title, description, id, ...props }: CheckboxCardProps) {
  const uid = React.useId();
  const checkboxId = id ?? uid;
  const titleId = `${checkboxId}-title`;
  const descriptionId = `${checkboxId}-description`;

  return (
    <label
      data-slot="checkbox-card"
      htmlFor={checkboxId}
      className={cn(
        "flex min-w-0 cursor-pointer items-start gap-3 rounded-xl bg-card p-4 text-left shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-(--duration-press) has-[[data-state=checked]]:shadow-[0_0_0_2px_var(--primary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 motion-reduce:transition-none",
        className,
      )}
    >
      <Checkbox
        id={checkboxId}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 size-5 rounded-md"
        {...props}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span id={titleId} className="text-[15px] font-semibold break-words">
          {title}
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

export { CheckboxCard, type CheckboxCardProps };
