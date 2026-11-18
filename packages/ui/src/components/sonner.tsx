import { cn } from "@pochimail/ui/lib/utils";
import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

// Defaults to dark so `.dark` tokens resolve (e.g. undo toasts); pass `theme`/`className` to override.
function Toaster({ theme = "dark", className, ...props }: ToasterProps) {
  return (
    <Sonner
      data-slot="toaster"
      theme={theme}
      className={cn("toaster group dark", className)}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster, toast };
