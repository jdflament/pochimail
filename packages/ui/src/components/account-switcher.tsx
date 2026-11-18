import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pochimail/ui/components/dropdown-menu";
import { cn } from "@pochimail/ui/lib/utils";
import { ChevronDownIcon, PlusIcon, UsersIcon } from "lucide-react";
import type * as React from "react";

type AccountOption = { id: string; label: string };

type AccountSwitcherLabels = {
  /** The menu's accessible name, e.g. "Account". */
  menu: string;
  /** "All accounts". */
  all: string;
  /** "Add another account". */
  add: string;
};

type AccountSwitcherProps = Omit<React.ComponentProps<"button">, "value" | "onChange"> & {
  accounts: readonly AccountOption[];
  /** The selected account id, or `null` for all accounts. */
  value: string | null;
  onValueChange: (accountId: string | null) => void;
  onAddAccount: () => void;
  labels: AccountSwitcherLabels;
};

const ALL = "__all__";

/** A DropdownMenu of radio items: All accounts, one per account, then "Add another account". */
function AccountSwitcher({
  className,
  accounts,
  value,
  onValueChange,
  onAddAccount,
  labels,
  ...props
}: AccountSwitcherProps) {
  const current = accounts.find((account) => account.id === value)?.label ?? labels.all;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="account-switcher"
          aria-label={`${labels.menu}: ${current}`}
          className={cn(
            "flex min-h-10 min-w-0 items-center gap-2 rounded-[10px] border border-border bg-background px-3 text-start text-[15px] outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 @max-[960px]:justify-center @max-[960px]:px-0 @min-[560px]:@max-[960px]:w-full [&_svg]:size-[18px] [&_svg]:shrink-0",
            className,
          )}
          {...props}
        >
          <UsersIcon aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium @min-[560px]:@max-[960px]:sr-only">
            {current}
          </span>
          <ChevronDownIcon aria-hidden="true" className="@min-[560px]:@max-[960px]:hidden" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel>{labels.menu}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? ALL}
          onValueChange={(next) => onValueChange(next === ALL ? null : next)}
        >
          <DropdownMenuRadioItem value={ALL}>{labels.all}</DropdownMenuRadioItem>
          {accounts.map((account) => (
            <DropdownMenuRadioItem key={account.id} value={account.id}>
              {account.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAddAccount}>
          <PlusIcon aria-hidden="true" />
          {labels.add}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export {
  type AccountOption,
  AccountSwitcher,
  type AccountSwitcherLabels,
  type AccountSwitcherProps,
};
