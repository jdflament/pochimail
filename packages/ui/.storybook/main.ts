import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.tsx", "../../../apps/desktop/src/renderer/**/*.stories.tsx"],
  staticDirs: [{ from: "../src/assets/brand", to: "/brand" }],
  addons: ["@storybook/addon-a11y", "@storybook/addon-themes"],
  // Local-only product: Storybook sends no usage telemetry.
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    // Stories mount the real router, which reads this compile-time global (the dev gallery route,
    // apps/desktop/src/shared/gallery-build.ts). Storybook is a dev tool, so it is on.
    define: { ...viteConfig.define, __POCHIMAIL_GALLERY__: "true" },
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
