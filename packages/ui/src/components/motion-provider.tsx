import { AnimationsContext } from "@pochimail/ui/hooks/use-motion";
import * as React from "react";

/**
 * Settings › Appearance › Animations. Off makes every motion instant: components read it through useMotionEnabled,
 * and `data-animations="off"` on <html> zeroes the CSS-only ones (globals.css), exactly like prefers-reduced-motion.
 */
function MotionProvider({
  animations = true,
  children,
}: {
  animations?: boolean;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const root = document.documentElement;
    if (animations) root.removeAttribute("data-animations");
    else root.setAttribute("data-animations", "off");
    return () => root.removeAttribute("data-animations");
  }, [animations]);
  return <AnimationsContext value={animations}>{children}</AnimationsContext>;
}

export { MotionProvider };
