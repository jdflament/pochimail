import { Checkbox } from "@pochimail/ui/components/checkbox";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Checkbox",
  component: Checkbox,
  args: { "aria-label": "Archive newsletters" },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
