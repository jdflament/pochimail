import { Button } from "@pochimail/ui/components/button";
import { Mascot, type MascotPose } from "@pochimail/ui/components/mascot";
import { cn } from "@pochimail/ui/lib/utils";
import type * as React from "react";

type StateAction = { label: string; onClick: () => void };

type EmptyStateProps = Omit<React.ComponentProps<"section">, "title" | "children"> & {
  pose?: MascotPose;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The one primary action. Required: an empty or error state is never a dead end. */
  action: StateAction;
  /** Optional quiet alternative (ghost button); never a second primary. */
  secondaryAction?: StateAction;
};

// One component for empty and error states (docs/design/screens/html/States.html): mascot, h2 title, one primary action.
function EmptyState({
  className,
  pose = "default",
  title,
  description,
  action,
  secondaryAction,
  ...props
}: EmptyStateProps) {
  return (
    <section
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-xl bg-card px-5 py-6 text-center shadow-[inset_0_0_0_1px_var(--border)]",
        className,
      )}
      {...props}
    >
      <Mascot pose={pose} size="sm" />
      <h2 className="m-0 text-[17px] font-semibold break-words">{title}</h2>
      {description ? (
        <p className="m-0 max-w-[260px] text-sm leading-normal break-words text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap justify-center gap-1.5">
        <Button data-slot="empty-state-action" onClick={action.onClick}>
          {action.label}
        </Button>
        {secondaryAction ? (
          <Button
            data-slot="empty-state-secondary"
            variant="ghost"
            className="text-muted-foreground"
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export { EmptyState, type EmptyStateProps, type StateAction };
