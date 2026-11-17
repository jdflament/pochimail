import "@pochimail/ui/globals.css";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";

// The toolbar switches the `.dark` class on <html>, exactly like the app does (tokens.css, Toaster).
const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: "", dark: "dark" }, defaultTheme: "light" }),
  ],
  parameters: {
    layout: "centered",
    // The surface comes from the tokens; the backgrounds addon would paint literal colors over them.
    backgrounds: { disabled: true },
    // Axe panel only for now; automated axe runs in CI come with Playwright in M4.
    a11y: { test: "todo" },
  },
};

export default preview;
