import { Button } from "@pochimail/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@pochimail/ui/components/tooltip";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Tooltip",
  component: Tooltip,
  parameters: { layout: "padded" },
  render: (args) => (
    <TooltipProvider>
      <Tooltip {...args}>
        <TooltipTrigger asChild>
          <Button variant="secondary">Undo</Button>
        </TooltipTrigger>
        <TooltipContent>Puts everything back where it was</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

// Open by default so the content is rendered (and checked by axe) without a hover.
export const Open: Story = { args: { open: true } };
export const Closed: Story = {};
