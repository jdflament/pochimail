import { Toaster } from "@pochimail/ui/components/sonner";
import { toast } from "sonner";

/** Brief §6: an undo toast stays for 5 seconds. */
const UNDO_TOAST_DURATION_MS = 5000;

type UndoToastOptions = {
  message: string;
  onUndo: () => void;
  undoLabel?: string;
};

// Mount once near the app root (replaces <Toaster/>). Undo toasts are always dark, in either theme: the `dark` class scopes the dark tokens to the toaster.
function UndoToaster() {
  return <Toaster theme="dark" className="toaster group dark" />;
}

// The undo callback runs at most once, even if the action is clicked again while the toast animates out.
function showUndoToast({ message, onUndo, undoLabel = "Undo" }: UndoToastOptions) {
  let undone = false;
  return toast(message, {
    duration: UNDO_TOAST_DURATION_MS,
    action: {
      label: undoLabel,
      onClick: () => {
        if (undone) return;
        undone = true;
        onUndo();
      },
    },
  });
}

export { showUndoToast, UNDO_TOAST_DURATION_MS, UndoToaster, type UndoToastOptions };
