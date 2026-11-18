import "@pochimail/ui/globals.css";
import { setLocale } from "@pochimail/ui/i18n/format.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import { appLocale } from "./lib/locale.ts";
import { followSystemTheme } from "./lib/theme.ts";
import { connectWorker } from "./lib/worker.ts";

followSystemTheme();
setLocale(appLocale());

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const workerClient = connectWorker();
createRoot(root).render(
  <StrictMode>
    <App workerClient={workerClient} />
  </StrictMode>,
);
