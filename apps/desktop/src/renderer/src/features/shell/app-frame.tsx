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
import { getLocale, t } from "@pochimail/ui/i18n/format.ts";
import type { MessageKey } from "@pochimail/ui/i18n/messages.ts";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
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
import type { ComponentType } from "react";
import { queryKeys } from "../../lib/query/keys.ts";
import { useWorkerClient } from "../../lib/worker-context.tsx";
import { visibleCategories } from "./visible-categories.ts";

const CATEGORY_NAV: Record<string, { label: MessageKey; icon: ComponentType }> = {
  people: { label: "category.people", icon: UserIcon },
  records: { label: "category.records", icon: FileTextIcon },
  "purchases-travel": { label: "category.purchasesTravel", icon: ShoppingBagIcon },
  "sign-ins-security": { label: "category.signInsSecurity", icon: KeyRoundIcon },
  notifications: { label: "category.notifications", icon: BellIcon },
  newsletters: { label: "category.newsletters", icon: NewspaperIcon },
  promotions: { label: "category.promotions", icon: TagIcon },
};

type NavTarget = "/overview" | "/documents" | "/activity" | "/settings";

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: NavTarget;
  label: string;
  icon: ComponentType;
  /** The current pathname. */
  active: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active === to}>
        <Link to={to} search={(prev) => prev}>
          <Icon />
          <SidebarMenuLabel>{label}</SidebarMenuLabel>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The frame of every screen after onboarding: sidebar, icon rail or bottom tabs by container width, with
 * the account switcher. The account selection lives in the router (`?account=`); counts follow it.
 */
export function AppFrame() {
  const client = useWorkerClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { account } = useSearch({ strict: false });

  const accounts = useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: () => client.call("accounts.list"),
  });
  const accountList = accounts.data ?? [];
  const selected = accountList.some((a) => a.id === account) ? (account ?? null) : null;
  const accountIds = selected === null ? accountList.map((a) => a.id) : [selected];

  const counts = useQuery({
    queryKey: queryKeys.categoryCounts(accountIds),
    queryFn: () => client.call("mailbox.categories", { accountIds }),
    enabled: accounts.isSuccess,
  });
  const categories = visibleCategories(counts.data);
  const locale = getLocale();

  return (
    <SidebarProvider>
      <SidebarLayout>
        <Sidebar>
          <SidebarHeader>
            <SidebarBrand>{t("nav.brand")}</SidebarBrand>
            <AccountSwitcher
              accounts={accountList.map((a) => ({ id: a.id, label: a.displayName }))}
              value={selected}
              onValueChange={(next) =>
                void navigate({
                  to: ".",
                  search: (prev) => {
                    const { account: _previous, ...rest } = prev;
                    return next === null ? rest : { ...rest, account: next };
                  },
                })
              }
              onAddAccount={() => void navigate({ to: "/connect" })}
              labels={{
                menu: t("switcher.menu"),
                all: t("switcher.all"),
                add: t("switcher.add"),
              }}
            />
          </SidebarHeader>
          <SidebarContent aria-label={t("nav.label")}>
            <SidebarGroup>
              <SidebarGroupLabel>{t("nav.email")}</SidebarGroupLabel>
              <SidebarMenu>
                <NavItem
                  to="/overview"
                  label={t("overview.title")}
                  icon={LayoutGridIcon}
                  active={pathname}
                />
                {categories.map(({ id, count }) => {
                  const nav = CATEGORY_NAV[id];
                  if (nav === undefined) return null;
                  const Icon = nav.icon;
                  const target = `/category/${id}`;
                  return (
                    <SidebarMenuItem key={id} reach="wide">
                      <SidebarMenuButton asChild isActive={pathname === target} tone="muted">
                        <Link
                          to="/category/$categoryId"
                          params={{ categoryId: id }}
                          search={(prev) => prev}
                        >
                          <Icon />
                          <SidebarMenuLabel>{t(nav.label)}</SidebarMenuLabel>
                          <SidebarMenuBadge>{count.toLocaleString(locale)}</SidebarMenuBadge>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>{t("nav.tools")}</SidebarGroupLabel>
              <SidebarMenu>
                <NavItem
                  to="/documents"
                  label={t("documents.title")}
                  icon={PaperclipIcon}
                  active={pathname}
                />
                <NavItem
                  to="/activity"
                  label={t("activity.title")}
                  icon={Undo2Icon}
                  active={pathname}
                />
                <NavItem
                  to="/settings"
                  label={t("settings.title")}
                  icon={SettingsIcon}
                  active={pathname}
                />
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tone="muted">
                  <button type="button" disabled aria-disabled="true">
                    <UsersIcon />
                    <SidebarMenuLabel>{t("nav.teams")}</SidebarMenuLabel>
                    <SidebarMenuBadge>{t("nav.soon")}</SidebarMenuBadge>
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarLayout>
    </SidebarProvider>
  );
}
