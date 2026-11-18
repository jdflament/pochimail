import { AccountSwitcher } from "@pochimail/ui/components/account-switcher";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { lightDecorator } from "./story-utils";

const meta = {
  title: "Components/AccountSwitcher",
  component: AccountSwitcher,
  decorators: [lightDecorator],
  args: {
    accounts: [
      { id: "gmail", label: "alex@example.test" },
      { id: "outlook", label: "alex@work.example.test" },
    ],
    value: null,
    onValueChange: () => {},
    onAddAccount: () => {},
    labels: { menu: "Account", all: "All accounts", add: "Add another account" },
  },
  render: (args) => {
    const [value, setValue] = useState<string | null>(args.value);
    return (
      <div className="w-64">
        <AccountSwitcher {...args} value={value} onValueChange={setValue} />
      </div>
    );
  },
} satisfies Meta<typeof AccountSwitcher>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllAccounts: Story = {};
export const OneAccount: Story = { args: { value: "outlook" } };
export const LongFrench: Story = {
  args: {
    value: "outlook",
    accounts: [{ id: "outlook", label: "prenom.nom.tres.long@exemple-entreprise.example.test" }],
    labels: { menu: "Compte", all: "Tous les comptes", add: "Ajouter un autre compte" },
  },
};
