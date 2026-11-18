import {
  AccountSwitcher,
  AccountSwitcherContent,
  AccountSwitcherGroup,
  AccountSwitcherItem,
  AccountSwitcherLabel,
  AccountSwitcherTrigger,
  ALL_ACCOUNTS,
} from "@pochimail/ui/components/account-switcher";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@pochimail/ui/components/dropdown-menu";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronDownIcon, PlusIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { lightDecorator } from "./story-utils";

type Copy = { menu: string; all: string; add: string };
const EN: Copy = { menu: "Account", all: "All accounts", add: "Add another account" };

function Demo({
  accounts,
  initial,
  copy,
}: {
  accounts: { id: string; label: string }[];
  initial: string;
  copy: Copy;
}) {
  const [value, setValue] = useState(initial);
  const current = accounts.find((a) => a.id === value)?.label ?? copy.all;
  return (
    <div className="w-64">
      <AccountSwitcher>
        <AccountSwitcherTrigger aria-label={`${copy.menu}: ${current}`}>
          <UsersIcon aria-hidden="true" />
          <AccountSwitcherLabel>{current}</AccountSwitcherLabel>
          <ChevronDownIcon aria-hidden="true" />
        </AccountSwitcherTrigger>
        <AccountSwitcherContent>
          <DropdownMenuLabel>{copy.menu}</DropdownMenuLabel>
          <AccountSwitcherGroup value={value} onValueChange={setValue}>
            <AccountSwitcherItem value={ALL_ACCOUNTS}>{copy.all}</AccountSwitcherItem>
            {accounts.map((a) => (
              <AccountSwitcherItem key={a.id} value={a.id}>
                {a.label}
              </AccountSwitcherItem>
            ))}
          </AccountSwitcherGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <PlusIcon aria-hidden="true" />
            {copy.add}
          </DropdownMenuItem>
        </AccountSwitcherContent>
      </AccountSwitcher>
    </div>
  );
}

const ACCOUNTS = [
  { id: "gmail", label: "alex@example.test" },
  { id: "outlook", label: "alex@work.example.test" },
];

const meta = {
  title: "Components/AccountSwitcher",
  component: Demo,
  decorators: [lightDecorator],
  args: { accounts: ACCOUNTS, initial: ALL_ACCOUNTS, copy: EN },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllAccounts: Story = {};
export const OneAccount: Story = { args: { initial: "outlook" } };
export const LongFrench: Story = {
  args: {
    initial: "outlook",
    accounts: [{ id: "outlook", label: "prenom.nom.tres.long@exemple-entreprise.example.test" }],
    copy: { menu: "Compte", all: "Tous les comptes", add: "Ajouter un autre compte" },
  },
};
