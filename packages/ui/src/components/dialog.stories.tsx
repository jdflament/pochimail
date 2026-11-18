import { Button } from "@pochimail/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pochimail/ui/components/dialog";
import { t } from "@pochimail/ui/i18n/format.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { XIcon } from "lucide-react";

const meta = {
  title: "Components/Dialog",
  component: Dialog,
  parameters: { layout: "padded" },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button variant="secondary">Review batch</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive 24 emails?</DialogTitle>
          <DialogDescription>Nothing is deleted. You can undo this at any time.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button>Archive</Button>
        </DialogFooter>
        <DialogClose
          data-slot="dialog-close"
          className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        >
          <XIcon />
          <span className="sr-only">{t("action.close")}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  ),
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { defaultOpen: true } };
export const Closed: Story = {};
