import * as React from "react";

/** Settings › Appearance › Animations. Provided by MotionProvider (and MascotProvider). */
export const AnimationsContext = React.createContext(true);

/** True when the OS asks for reduced motion. */
function usePrefersReducedMotion(): boolean {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
  }, []);
  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** False under prefers-reduced-motion or when the Animations setting is off: components then skip transforms and transitions. */
export function useMotionEnabled(local?: boolean): boolean {
  const setting = React.use(AnimationsContext);
  // Always call the hook: a short-circuit would change the hook order when the Animations setting flips at runtime.
  const reduced = usePrefersReducedMotion();
  return (local ?? setting) && !reduced;
}
