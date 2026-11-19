import { ScrollArea } from "@pochimail/ui/components/scroll-area";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/ScrollArea",
  component: ScrollArea,
  args: { className: "h-40 w-64 rounded-xl border p-3", tabIndex: 0 },
  render: (args) => (
    <ScrollArea {...args}>
      <ul className="flex flex-col gap-2 text-ui">
        {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
          <li key={n}>Sender group {n}</li>
        ))}
      </ul>
    </ScrollArea>
  ),
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
