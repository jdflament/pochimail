import type { Decorator } from "@storybook/react-vite";

// Scopes the dark tokens (.dark) to one story so light and dark render side by side in the sidebar.
const darkDecorator: Decorator = (Story) => (
  <div className="dark w-160 max-w-full rounded-xl bg-background p-6 text-foreground">
    <Story />
  </div>
);

// Fixed width wrapper for light stories.
const lightDecorator: Decorator = (Story) => (
  <div className="w-160 max-w-full p-6">
    <Story />
  </div>
);

// Narrow container: proves long French and Japanese labels wrap instead of overflowing.
const narrowDecorator: Decorator = (Story) => (
  <div className="w-80 max-w-full border border-dashed border-border p-2">
    <Story />
  </div>
);

export { darkDecorator, lightDecorator, narrowDecorator };
