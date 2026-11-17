import defaultPose2x from "@pochimail/ui/assets/mascot/pochi-default@2x.png";
import defaultPose from "@pochimail/ui/assets/mascot/pochi-default.png";
import happyPose2x from "@pochimail/ui/assets/mascot/pochi-happy@2x.png";
import happyPose from "@pochimail/ui/assets/mascot/pochi-happy.png";
import nightPose2x from "@pochimail/ui/assets/mascot/pochi-night@2x.png";
import nightPose from "@pochimail/ui/assets/mascot/pochi-night.png";
import readingPose2x from "@pochimail/ui/assets/mascot/pochi-reading@2x.png";
import readingPose from "@pochimail/ui/assets/mascot/pochi-reading.png";
import savingPose2x from "@pochimail/ui/assets/mascot/pochi-saving@2x.png";
import savingPose from "@pochimail/ui/assets/mascot/pochi-saving.png";
import { cn } from "@pochimail/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const poses = {
  default: [defaultPose, defaultPose2x],
  happy: [happyPose, happyPose2x],
  reading: [readingPose, readingPose2x],
  saving: [savingPose, savingPose2x],
  night: [nightPose, nightPose2x],
} as const;

export type MascotPose = keyof typeof poses;

// Settings › Appearance › "Show Pochi": one provider near the app root hides every Mascot below it.
const ShowPochiContext = React.createContext(true);

function MascotProvider({
  showPochi,
  children,
}: {
  showPochi: boolean;
  children: React.ReactNode;
}) {
  return <ShowPochiContext value={showPochi}>{children}</ShowPochiContext>;
}

// Idle breathing (`pochi-breathe`, globals.css) is the only looping animation; it never runs under reduced motion.
const mascotVariants = cva("block h-auto select-none motion-safe:animate-pochi-breathe", {
  variants: {
    size: { sm: "w-16", md: "w-32", lg: "w-48" },
  },
  defaultVariants: { size: "md" },
});

type MascotProps = Omit<React.ComponentProps<"img">, "src" | "srcSet"> &
  VariantProps<typeof mascotVariants> & {
    pose?: MascotPose;
    /** Local override; the mascot is hidden when this or the provider's `showPochi` is false. */
    show?: boolean;
  };

function Mascot({
  pose = "default",
  size,
  show = true,
  alt = "",
  className,
  ...props
}: MascotProps) {
  const showPochi = React.use(ShowPochiContext);
  if (!show || !showPochi) return null;

  const [x1, x2] = poses[pose];
  return (
    <img
      data-slot="mascot"
      data-pose={pose}
      src={x1}
      srcSet={`${x1} 1x, ${x2} 2x`}
      alt={alt}
      className={cn(mascotVariants({ size }), className)}
      {...props}
    />
  );
}

export { Mascot, type MascotProps, MascotProvider, mascotVariants };
