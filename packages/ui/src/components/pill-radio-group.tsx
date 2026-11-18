import { RadioGroup } from "@pochimail/ui/components/radio-group";
import { cn } from "@pochimail/ui/lib/utils";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type * as React from "react";

function PillRadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup
      data-slot="pill-radio-group"
      className={cn("flex flex-wrap gap-2", className)}
      {...props}
    />
  );
}

// Checked state is carried by fill AND aria-checked (never color alone): the selected pill is inverted.
function PillRadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="pill-radio-group-item"
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-full border border-foreground-tertiary px-4 text-sm font-medium whitespace-nowrap outline-none transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground motion-reduce:transition-none motion-reduce:active:scale-100",
        className,
      )}
      {...props}
    />
  );
}

export { PillRadioGroup, PillRadioGroupItem };
