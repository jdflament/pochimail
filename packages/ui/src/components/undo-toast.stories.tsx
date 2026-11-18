import { Button } from "@pochimail/ui/components/button";
import { showUndoToast, UndoToaster } from "@pochimail/ui/components/undo-toast";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator } from "./story-utils";

function Trigger({ message, undo }: { message: string; undo: string }) {
  return (
    <>
      <UndoToaster />
      <Button
        variant="secondary"
        onClick={() => showUndoToast({ message, undoLabel: undo, onUndo: () => {} })}
      >
        Archive
      </Button>
    </>
  );
}

const meta = {
  title: "Components/UndoToast",
  component: UndoToaster,
  parameters: { layout: "padded" },
  render: () => <Trigger message="24 emails archived" undo="Undo" />,
} satisfies Meta<typeof UndoToaster>;

export default meta;
type Story = StoryObj<typeof meta>;

// Always dark, whatever the app theme: the light story proves it.
export const Light: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const French: Story = {
  render: () => <Trigger message="24 e-mails archivés" undo="Annuler" />,
};
export const Japanese: Story = {
  render: () => <Trigger message="24件のメールをアーカイブしました" undo="元に戻す" />,
};
