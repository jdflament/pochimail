import "@pochimail/ui/globals.css";
import { setLocale } from "@pochimail/ui/i18n/format.ts";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { appLocale } from "./lib/locale.ts";
import { followSystemTheme } from "./lib/theme.ts";
import { router } from "./router.tsx";

followSystemTheme();
setLocale(appLocale());

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
