import { useT } from "@pochimail/ui/i18n/i18n-provider.tsx";
import { cn } from "@pochimail/ui/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * A modal sheet over the current screen: a bottom sheet below 560px, a centred sheet from 560px (CSS container query on the layer, same markup).
 *
 * Composition: <Sheet><SheetTrigger/><SheetContent><SheetHeader><SheetTitle/><SheetDescription/></SheetHeader>…<SheetFooter><SheetClose/></SheetFooter></SheetContent></Sheet>.
 * Dialog semantics (labelled by the title, focus trap, scroll lock, Esc, focus returns to the opener) come from Radix Dialog.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-frame/80 data-[state=closed]:animate-sheet-scrim-out data-[state=open]:animate-sheet-scrim-in",
        className,
      )}
      {...props}
    />
  );
}

/** Layout follows the width of the sheet's layer (the window, or the portal container): below 560px a bottom sheet, from 560px a centred sheet. */
const sheetContentClass = cn(
  "pointer-events-auto relative grid max-h-full min-w-0 gap-4 overflow-y-auto bg-background p-6 text-foreground shadow-lg outline-none",
  // Below 560px: bottom sheet.
  "@max-phone:w-full @max-phone:rounded-t-2xl @max-phone:pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  // From 560px: centred sheet.
  "@min-phone:m-4 @min-phone:w-full @min-phone:max-w-lg @min-phone:self-center @min-phone:rounded-2xl",
);
/** Enter/exit slides; under reduced motion or Animations off globals.css zeroes the slide distance, leaving a short opacity cross-fade. */
const sheetMotionClass =
  "@max-phone:data-[state=closed]:animate-sheet-bottom-out @max-phone:data-[state=open]:animate-sheet-bottom-in @min-phone:data-[state=closed]:animate-sheet-out @min-phone:data-[state=open]:animate-sheet-in";

type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** Where to mount the sheet; defaults to the document body (the whole window). */
  container?: React.ComponentProps<typeof SheetPrimitive.Portal>["container"];
};

function SheetContent({ className, children, container, ...props }: SheetContentProps) {
  const t = useT();
  return (
    <SheetPrimitive.Portal container={container}>
      <SheetOverlay />
      <div
        data-slot="sheet-layer"
        className="@container pointer-events-none fixed inset-0 z-50 flex items-end justify-center"
      >
        <SheetPrimitive.Content
          data-slot="sheet-content"
          className={cn(sheetContentClass, sheetMotionClass, className)}
          {...props}
        >
          {children}
          <SheetPrimitive.Close
            data-slot="sheet-close-button"
            className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--duration-press) hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden motion-reduce:transition-none [&_svg]:size-4"
          >
            <XIcon aria-hidden="true" />
            <span className="sr-only">{t("action.close")}</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </div>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-2 pr-8", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "flex flex-col-reverse gap-2 @min-phone:flex-row @min-phone:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-2xl leading-tight font-medium", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  type SheetContentProps,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
  SheetTrigger,
};
