import { CheckboxCard } from "@pochimail/ui/components/checkbox-card";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/CheckboxCard",
  component: CheckboxCard,
  decorators: [lightDecorator],
  args: {
    title: "Catch what matters",
    description: "Flag people waiting on you, deadlines and important senders.",
  },
} satisfies Meta<typeof CheckboxCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DarkUnchecked: Story = { decorators: [darkDecorator] };
export const DarkChecked: Story = { decorators: [darkDecorator], args: { defaultChecked: true } };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    defaultChecked: true,
    title: "Repérer ce qui compte vraiment pour vous",
    description:
      "Je signale les personnes qui attendent une réponse, les échéances et les expéditeurs importants.",
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    title: "大切なメールを見逃さない",
    description: "返信を待っている人、期限、重要な送信者のメールを知らせます。",
  },
};
