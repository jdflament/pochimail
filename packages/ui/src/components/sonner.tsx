import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const getTheme = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");

// Follows the `.dark` class on <html> (the app's theme switch, even when forced against the OS); pass `theme` to override.
function Toaster({ theme, ...props }: ToasterProps) {
  const current = React.useSyncExternalStore(subscribe, getTheme, () => "light" as const);
  return (
    <Sonner
      data-slot="toaster"
      theme={theme ?? current}
      className="toaster group"
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

export { Toaster };
