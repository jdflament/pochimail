import "@pochimail/ui/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import { followSystemTheme } from "./lib/theme.ts";
import { connectWorker } from "./lib/worker.ts";

followSystemTheme();

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
const workerClient = connectWorker();
createRoot(root).render(
  <StrictMode>
    <App workerClient={workerClient} />
  </StrictMode>,
);
