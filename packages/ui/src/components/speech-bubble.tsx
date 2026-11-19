import { Mascot, type MascotPose } from "@pochimail/ui/components/mascot";
import { cn } from "@pochimail/ui/lib/utils";
import type * as React from "react";

type SpeechBubbleProps = React.ComponentProps<"div"> & {
  /** Pochi's pose beside the bubble. The mascot hides itself when "Show Pochi" is off; the bubble stays. */
  pose?: MascotPose;
};

function SpeechBubble({ className, pose = "default", children, ...props }: SpeechBubbleProps) {
  return (
    <div
      data-slot="speech-bubble"
      className={cn("flex items-center justify-center gap-4", className)}
      {...props}
    >
      <Mascot pose={pose} size="sm" />
      <div
        data-slot="speech-bubble-body"
        className="relative max-w-110 min-w-0 rounded-xl bg-card px-4 py-3 text-left text-body leading-normal break-words text-card-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      >
        <span
          aria-hidden="true"
          data-slot="speech-bubble-tail"
          className="absolute top-5 -left-1.5 size-2.75 rotate-45 bg-card shadow-[-1px_1px_0_var(--border)]"
        />
        {children}
      </div>
    </div>
  );
}

export { SpeechBubble, type SpeechBubbleProps };
