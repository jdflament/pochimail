import type { Meta, StoryObj } from "@storybook/react-vite";
import { Mascot, MascotProvider } from "./mascot";

const meta = {
  title: "Components/Mascot",
  component: Mascot,
  args: { alt: "" },
} satisfies Meta<typeof Mascot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Happy: Story = { args: { pose: "happy" } };
export const Reading: Story = { args: { pose: "reading" } };
export const Saving: Story = { args: { pose: "saving" } };
export const Night: Story = { args: { pose: "night" } };

export const FoundReaction: Story = {
  args: { pose: "reading", reaction: "found" },
};

export const AnimationsOff: Story = {
  decorators: [
    (Story) => (
      <MascotProvider animations={false}>
        <Story />
      </MascotProvider>
    ),
  ],
};

export const ShowPochiOff: Story = {
  decorators: [
    (Story) => (
      <MascotProvider showPochi={false}>
        <div className="flex items-center gap-2 border border-dashed border-border p-2">
          <Story />
          <span className="text-sm text-muted-foreground">Layout space remains.</span>
        </div>
      </MascotProvider>
    ),
  ],
};

export const ReducedMotion: Story = {
  decorators: [
    (Story) => (
      <MascotProvider reducedMotion>
        <Story />
      </MascotProvider>
    ),
  ],
};
