import { AccountSwitcher } from "@pochimail/ui/components/account-switcher";
import { SidebarMenuButton } from "@pochimail/ui/components/sidebar";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

it("sets aria-current only on the active item (guards a tab bar that cannot tell where you are)", () => {
  render(
    <>
      <SidebarMenuButton href="#a" isActive>
        A
      </SidebarMenuButton>
      <SidebarMenuButton href="#b">B</SidebarMenuButton>
    </>,
  );
  expect(screen.getByRole("link", { name: "A" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "B" }).getAttribute("aria-current")).toBeNull();
});

it("reports null for All accounts, the id for one account, and offers adding another (guards a switcher that cannot go back to all)", async () => {
  const onValueChange = vi.fn();
  const onAddAccount = vi.fn();
  render(
    <AccountSwitcher
      accounts={[{ id: "a1", label: "one@example.test" }]}
      value="a1"
      onValueChange={onValueChange}
      onAddAccount={onAddAccount}
      labels={{ menu: "Account", all: "All accounts", add: "Add another account" }}
    />,
  );
  const open = () =>
    userEvent.click(screen.getByRole("button", { name: /Account: one@example.test/ }));
  await open();
  await userEvent.click(await screen.findByRole("menuitemradio", { name: "All accounts" }));
  expect(onValueChange).toHaveBeenCalledWith(null);
  await open();
  await userEvent.click(await screen.findByRole("menuitem", { name: "Add another account" }));
  expect(onAddAccount).toHaveBeenCalledOnce();
});
