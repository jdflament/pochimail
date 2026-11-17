import { Mascot, MascotProvider } from "@pochimail/ui/components/mascot";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Mascot",
  component: Mascot,
  args: { alt: "Pochi" },
} satisfies Meta<typeof Mascot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Happy: Story = { args: { pose: "happy" } };
export const Reading: Story = { args: { pose: "reading" } };
export const Saving: Story = { args: { pose: "saving" } };
export const Night: Story = { args: { pose: "night" } };
export const Small: Story = { args: { size: "sm" } };
export const Large: Story = { args: { size: "lg" } };
export const HiddenBySetting: Story = {
  decorators: [
    (Story) => (
      <MascotProvider showPochi={false}>
        <p className="text-sm">Settings › Appearance › Show Pochi is off: nothing below.</p>
        <Story />
      </MascotProvider>
    ),
  ],
};
