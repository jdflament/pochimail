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
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
};

export default config;
