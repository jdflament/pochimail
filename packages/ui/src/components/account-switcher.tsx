import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@pochimail/ui/components/dropdown-menu";
import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

/** The radio value of "All accounts" (an account id never equals it). */
const ALL_ACCOUNTS = "__all__";

const accountSwitcherTriggerVariants = cva(
  "flex min-h-10 min-w-0 items-center gap-2 rounded-md px-3 text-start text-body outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 @max-desktop:justify-center @max-desktop:px-0 @min-phone:@max-desktop:w-full [&_svg]:size-4.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        outline: "border border-border bg-background",
        ghost: "hover:bg-accent",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

/**
 * Composition: <AccountSwitcher><AccountSwitcherTrigger/><AccountSwitcherContent>
 * <AccountSwitcherGroup><AccountSwitcherItem/>…</AccountSwitcherGroup> …menu items…</AccountSwitcherContent>.
 * The menu's extras (label, separator, "Add another account") are the DropdownMenu parts as they are.
 */
function AccountSwitcher({ ...props }: React.ComponentProps<typeof DropdownMenu>) {
  return <DropdownMenu {...props} />;
}

function AccountSwitcherTrigger({
  className,
  variant,
  ...props
}: Omit<React.ComponentProps<"button">, "type"> &
  VariantProps<typeof accountSwitcherTriggerVariants>) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        data-slot="account-switcher-trigger"
        className={cn(accountSwitcherTriggerVariants({ variant }), className)}
        {...props}
      />
    </DropdownMenuTrigger>
  );
}

/** The current account's name: hidden (still read aloud) in the icon rail. */
function AccountSwitcherLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="account-switcher-label"
      className={cn(
        "min-w-0 flex-1 truncate font-medium @min-phone:@max-desktop:sr-only",
        className,
      )}
      {...props}
    />
  );
}

function AccountSwitcherContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="account-switcher-content"
      align="start"
      className={cn("min-w-56", className)}
      {...props}
    />
  );
}

function AccountSwitcherGroup({ ...props }: React.ComponentProps<typeof DropdownMenuRadioGroup>) {
  return <DropdownMenuRadioGroup data-slot="account-switcher-group" {...props} />;
}

function AccountSwitcherItem({ ...props }: React.ComponentProps<typeof DropdownMenuRadioItem>) {
  return <DropdownMenuRadioItem data-slot="account-switcher-item" {...props} />;
}

export {
  AccountSwitcher,
  AccountSwitcherContent,
  AccountSwitcherGroup,
  AccountSwitcherItem,
  AccountSwitcherLabel,
  AccountSwitcherTrigger,
  ALL_ACCOUNTS,
  accountSwitcherTriggerVariants,
};
