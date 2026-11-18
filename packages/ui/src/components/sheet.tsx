import { t } from "@pochimail/ui/i18n/format.ts";
import { cn } from "@pochimail/ui/lib/utils";
import { cva } from "class-variance-authority";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";

/** Narrower than this, the sheet docks to the bottom edge instead of floating in the centre. */
const BOTTOM_SHEET_BELOW = 560;

type SheetLayout = "centered" | "bottom";

/**
 * A modal sheet over the current screen: centred on desktop, a bottom sheet in a container narrower than 560px
 * (the same markup; the layout follows the width of the sheet's own layer, so it also holds in a narrow window or story frame).
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

const sheetContentVariants = cva(
  "pointer-events-auto relative grid max-h-full min-w-0 gap-4 overflow-y-auto bg-background p-6 text-foreground outline-none",
  {
    variants: {
      layout: {
        centered:
          "w-full max-w-lg rounded-2xl shadow-lg data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
        bottom:
          "w-full rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lg data-[state=closed]:animate-sheet-bottom-out data-[state=open]:animate-sheet-bottom-in",
      },
    },
    defaultVariants: { layout: "centered" },
  },
);

const sheetLayerVariants = cva("@container pointer-events-none fixed inset-0 z-50 flex", {
  variants: {
    layout: {
      centered: "items-center justify-center p-4",
      bottom: "items-end justify-center",
    },
  },
  defaultVariants: { layout: "centered" },
});

/** Tracks the layer's own width; measured before first paint so the sheet never flashes in the wrong layout. */
function useSheetLayout(): [React.RefCallback<HTMLDivElement>, SheetLayout] {
  const [layout, setLayout] = React.useState<SheetLayout>("centered");
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = (width: number) =>
      setLayout(width < BOTTOM_SHEET_BELOW ? "bottom" : "centered");
    measure(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, layout];
}

function SheetContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content>) {
  const [layerRef, layout] = useSheetLayout();
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetOverlay />
      <div
        ref={layerRef}
        data-slot="sheet-layer"
        data-layout={layout}
        className={sheetLayerVariants({ layout })}
      >
        <SheetPrimitive.Content
          data-slot="sheet-content"
          data-layout={layout}
          className={cn(sheetContentVariants({ layout }), className)}
          {...props}
        >
          {children}
          <SheetPrimitive.Close
            data-slot="sheet-close-button"
            className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden motion-reduce:transition-none [&_svg]:size-4"
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
        "flex flex-col-reverse gap-2 @min-[560px]:flex-row @min-[560px]:justify-end",
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
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
  SheetTrigger,
};
