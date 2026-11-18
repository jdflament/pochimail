import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

/*
 * Note: Tailwind's `@max-[N]` is "narrower than N", so `@max-[560px]` pairs with `@min-[560px]` with no gap.
 * Responsive frame (brief §6 › Responsive layout). One markup, restyled by the width of the
 * SidebarProvider box (container queries, not the viewport, so Storybook and tests can resize it):
 *   >= 960px  full sidebar
 *   560-959   icon rail (labels, counts, categories and topics hide)
 *   < 560     top bar (SidebarHeader) + bottom tabs (the nav); the content never remounts.
 */

function SidebarProvider({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-provider"
      className={cn("@container h-full min-h-0 w-full", className)}
      {...props}
    />
  );
}

function SidebarLayout({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-layout"
      className={cn(
        "grid h-full min-h-0 grid-cols-[4.5rem_minmax(0,1fr)] bg-background text-foreground @min-[960px]:grid-cols-[16rem_minmax(0,1fr)] @max-[560px]:grid-cols-[minmax(0,1fr)] @max-[560px]:grid-rows-[auto_minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    />
  );
}

function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex min-h-0 flex-col bg-sidebar text-sidebar-foreground border-e border-border @max-[560px]:contents",
        className,
      )}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn(
        "flex flex-col gap-3 p-3 @max-[560px]:row-start-1 @max-[560px]:flex-row @max-[560px]:items-center @max-[560px]:justify-between @max-[560px]:border-b @max-[560px]:border-border @max-[560px]:bg-sidebar",
        className,
      )}
      {...props}
    />
  );
}

/** The app name: shown in the full sidebar and the phone top bar, hidden in the rail. */
function SidebarBrand({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-brand"
      className={cn("px-2 font-semibold text-[17px] @min-[560px]:@max-[960px]:hidden", className)}
      {...props}
    />
  );
}

/** The navigation landmark. Pass `aria-label`. It becomes the bottom tab bar under 560px. */
function SidebarContent({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-2 @max-[560px]:row-start-3 @max-[560px]:flex-none @max-[560px]:flex-row @max-[560px]:items-stretch @max-[560px]:justify-around @max-[560px]:gap-0 @max-[560px]:overflow-visible @max-[560px]:border-t @max-[560px]:border-border @max-[560px]:bg-sidebar @max-[560px]:p-1",
        className,
      )}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("p-3 @max-[560px]:hidden", className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("flex flex-col gap-1 @max-[560px]:contents", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sidebar-group-label"
      className={cn(
        "px-2 pt-2 pb-1 font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.06em] @max-[960px]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("m-0 flex list-none flex-col gap-0.5 p-0 @max-[560px]:contents", className)}
      {...props}
    />
  );
}

const sidebarMenuItemVariants = cva("list-none @max-[560px]:flex-1", {
  variants: {
    // "wide" items (categories, topics) only exist in the full sidebar; "always" items survive to the tabs.
    reach: {
      always: "",
      wide: "@max-[960px]:hidden",
      // Not part of the phone tab bar (Teams).
      "not-tabs": "@max-[560px]:hidden",
    },
  },
  defaultVariants: { reach: "always" },
});

function SidebarMenuItem({
  className,
  reach,
  ...props
}: React.ComponentProps<"li"> & VariantProps<typeof sidebarMenuItemVariants>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn(sidebarMenuItemVariants({ reach }), className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "flex min-h-9 w-full items-center gap-3 rounded-[10px] px-2 text-start text-[15px] outline-hidden transition-colors duration-150 hover:bg-background/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-[current=page]:bg-background aria-[current=page]:font-medium aria-disabled:opacity-60 aria-disabled:hover:bg-transparent [&_svg]:size-[18px] [&_svg]:shrink-0 @max-[960px]:justify-center @max-[560px]:min-h-12 @max-[560px]:flex-col @max-[560px]:justify-center @max-[560px]:gap-0.5 @max-[560px]:px-1 @max-[560px]:text-[12px]",
  {
    variants: {
      tone: {
        default: "text-sidebar-foreground",
        muted: "text-muted-foreground",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

type SidebarMenuButtonProps = React.ComponentProps<"a"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    /** Marks the current page: sets `aria-current="page"`. */
    isActive?: boolean;
  };

function SidebarMenuButton({
  className,
  asChild = false,
  isActive = false,
  tone,
  ...props
}: SidebarMenuButtonProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      aria-current={isActive ? "page" : undefined}
      className={cn(sidebarMenuButtonVariants({ tone }), className)}
      {...props}
    />
  );
}

/** The visible name of an item. Hidden (but still read aloud) in the rail; shown again on the phone tab bar. */
function SidebarMenuLabel({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-menu-label"
      className={cn(
        "min-w-0 flex-1 truncate @min-[560px]:@max-[960px]:sr-only @max-[560px]:flex-none",
        className,
      )}
      {...props}
    />
  );
}

/** A count or a short note ("Soon"). Hidden below 960px. */
function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        "shrink-0 text-[13px] text-muted-foreground tabular-nums @max-[960px]:hidden",
        className,
      )}
      {...props}
    />
  );
}

/** The content column. Stays mounted across every layout swap. */
function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn("min-h-0 min-w-0 overflow-y-auto @max-[560px]:row-start-2", className)}
      {...props}
    />
  );
}

export type { SidebarMenuButtonProps };
export {
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
  sidebarMenuButtonVariants,
  sidebarMenuItemVariants,
};
