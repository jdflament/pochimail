import { easeOutCubic, MOTION } from "@pochimail/ui/lib/motion";
import { animate } from "motion/react";
import * as React from "react";
import { useMotionEnabled } from "./use-motion";

/** Rolls a number up from 0 once when it first lands (later changes glide from the shown value), then holds still. Instant when motion is off. */
export function useCountUp(target: number): number {
  const enabled = useMotionEnabled();
  const [value, setValue] = React.useState(enabled ? 0 : target);
  const shown = React.useRef(value);

  React.useEffect(() => {
    if (!enabled) return;
    const controls = animate(shown.current, target, {
      duration: MOTION.countUpMs / 1000,
      ease: easeOutCubic,
      onUpdate: (v) => {
        shown.current = v;
        setValue(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [target, enabled]);

  return enabled ? value : target;
}
