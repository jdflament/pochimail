import { AccountSwitcher } from "@pochimail/ui/components/account-switcher";
import {
  Sidebar,
  SidebarBrand,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarLayout,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLabel,
  SidebarProvider,
} from "@pochimail/ui/components/sidebar";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BellIcon,
  FileTextIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  NewspaperIcon,
  PaperclipIcon,
  SettingsIcon,
  ShoppingBagIcon,
  TagIcon,
  Undo2Icon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";

const ACCOUNTS = [
  { id: "gmail", label: "alex@example.test" },
  { id: "outlook", label: "alex@work.example.test" },
];
const CATEGORIES = [
  ["People", UserIcon, 6820],
  ["Records", FileTextIcon, 2104],
  ["Purchases & travel", ShoppingBagIcon, 3580],
  ["Sign-ins & security", KeyRoundIcon, 1962],
  ["Notifications", BellIcon, 14230],
  ["Newsletters", NewspaperIcon, 10410],
  ["Promotions", TagIcon, 9206],
] as const;

/** The whole frame in plain markup: only the width of the box around it decides rail, tabs or sidebar. */
function Frame({
  width,
  categories = CATEGORIES,
}: {
  width: number;
  categories?: readonly (typeof CATEGORIES)[number][];
}) {
  const [account, setAccount] = useState<string | null>(null);
  return (
    <div style={{ width, height: 640 }} className="max-w-full overflow-hidden border border-border">
      <SidebarProvider>
        <SidebarLayout>
          <Sidebar>
            <SidebarHeader>
              <SidebarBrand>Pochimail</SidebarBrand>
              <AccountSwitcher
                accounts={ACCOUNTS}
                value={account}
                onValueChange={setAccount}
                onAddAccount={() => {}}
                labels={{ menu: "Account", all: "All accounts", add: "Add another account" }}
              />
            </SidebarHeader>
            <SidebarContent aria-label="Main navigation">
              <SidebarGroup>
                <SidebarGroupLabel>Email</SidebarGroupLabel>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton href="#overview" isActive>
                      <LayoutGridIcon />
                      <SidebarMenuLabel>Overview</SidebarMenuLabel>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {categories.map(([label, Icon, count]) => (
                    <SidebarMenuItem key={label} reach="wide">
                      <SidebarMenuButton href="#category" tone="muted">
                        <Icon />
                        <SidebarMenuLabel>{label}</SidebarMenuLabel>
                        <SidebarMenuBadge>{count.toLocaleString("en")}</SidebarMenuBadge>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Tools</SidebarGroupLabel>
                <SidebarMenu>
                  {(
                    [
                      ["Documents", PaperclipIcon],
                      ["Activity", Undo2Icon],
                      ["Settings", SettingsIcon],
                    ] as const
                  ).map(([label, Icon]) => (
                    <SidebarMenuItem key={label}>
                      <SidebarMenuButton href={`#${label}`}>
                        <Icon />
                        <SidebarMenuLabel>{label}</SidebarMenuLabel>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tone="muted">
                    <button type="button" disabled aria-disabled="true">
                      <UsersIcon />
                      <SidebarMenuLabel>Teams</SidebarMenuLabel>
                      <SidebarMenuBadge>Soon</SidebarMenuBadge>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <main className="p-6">
              <h1 className="text-4xl">Overview</h1>
              <p className="mt-2 text-muted-foreground">
                Resize the story width to see the layout swap.
              </p>
            </main>
          </SidebarInset>
        </SidebarLayout>
      </SidebarProvider>
    </div>
  );
}

const meta = {
  title: "Components/Sidebar",
  component: Frame,
  parameters: { layout: "padded" },
  args: { width: 1100 },
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullSidebar: Story = { args: { width: 1100 } };
export const IconRail: Story = { args: { width: 860 } };
export const IconRailNarrowWindow: Story = { args: { width: 720 } };
export const BottomTabs: Story = { args: { width: 420 } };
/** Empty categories are the caller's to omit (D5): here only People and Newsletters have mail. */
export const HiddenEmptyCategories: Story = {
  args: { width: 1100, categories: [CATEGORIES[0], CATEGORIES[5]] },
};
export const Dark: Story = {
  args: { width: 1100 },
  decorators: [
    (Story) => (
      <div className="dark rounded-xl bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
};
