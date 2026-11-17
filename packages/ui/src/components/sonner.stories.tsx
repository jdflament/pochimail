import { Button } from "@pochimail/ui/components/button";
import { Toaster } from "@pochimail/ui/components/sonner";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

const meta = {
  title: "Components/Sonner",
  component: Toaster,
  parameters: { layout: "padded" },
  render: (args) => (
    <>
      <Toaster {...args} />
      <Button
        variant="secondary"
        onClick={() =>
          toast("24 emails archived", { action: { label: "Undo", onClick: () => {} } })
        }
      >
        Archive
      </Button>
    </>
  ),
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UndoToast: Story = {};
