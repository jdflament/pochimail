import { Skeleton } from "@pochimail/ui/components/skeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = { args: { className: "h-4 w-64" } };
export const Row: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2" aria-busy="true">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ),
};
