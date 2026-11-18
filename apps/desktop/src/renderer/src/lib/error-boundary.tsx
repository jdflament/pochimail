import { t } from "@pochimail/ui/i18n/format.ts";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches render failures and shows the shared error state instead of a blank window. */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured, no mail data. The console is local-only in the desktop app.
    console.error(
      JSON.stringify({
        event: "renderer-error",
        message: error.message,
        componentStack: info.componentStack,
      }),
    );
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-8 text-center">
          <h1 className="text-2xl">{t("shell.error.title")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("shell.error.body")}</p>
        </main>
      );
    }
    return this.props.children;
  }
}
