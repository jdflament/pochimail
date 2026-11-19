import { Separator } from "@pochimail/ui/components/separator";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Separator",
  component: Separator,
  decorators: [
    (Story) => (
      <div className="w-64 text-ui">
        Inbox
        <Story />
        Archive
      </div>
    ),
  ],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = { args: { className: "my-3" } };
export const Vertical: Story = {
  args: { orientation: "vertical" },
  decorators: [
    (Story) => (
      <div className="flex h-6 items-center gap-3 text-ui">
        Inbox
        <Story />
        Archive
      </div>
    ),
  ],
};
