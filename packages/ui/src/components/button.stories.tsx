import { Button } from "@pochimail/ui/components/button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRightIcon } from "lucide-react";

const meta = {
  title: "Components/Button",
  component: Button,
  args: { children: "Review" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Destructive: Story = { args: { variant: "destructive", children: "Remove account" } };
export const Link: Story = { args: { variant: "link" } };
export const Disabled: Story = { args: { disabled: true } };
export const WithIcon: Story = {
  render: (args) => (
    <Button {...args}>
      Review
      <ArrowRightIcon />
    </Button>
  ),
};
export const Icon: Story = {
  args: { size: "icon", variant: "secondary", "aria-label": "Next", children: <ArrowRightIcon /> },
};
