import { EmptyState } from "@pochimail/ui/components/empty-state";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/EmptyState",
  component: EmptyState,
  decorators: [
    (Story) => (
      <div className="w-[300px] max-w-full p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    pose: "default",
    title: "Nothing to clean here",
    description: "This category is already tidy. I’ll let you know when that changes.",
    action: { label: "Back to overview", onClick: () => {} },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { pose: "happy" } };
export const ErrorWithSecondary: Story = {
  args: {
    pose: "night",
    title: "I lost access to your Gmail",
    description: "Google asked you to sign in again. Your sorting and settings are safe.",
    action: { label: "Reconnect", onClick: () => {} },
    secondaryAction: { label: "Remove account", onClick: () => {} },
  },
};
export const Dark: Story = {
  decorators: [darkDecorator],
  args: ErrorWithSecondary.args as never,
};
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    title: "Je n’ai pas pu télécharger le modèle de l’assistant",
    description: "Je peux trier avec des règles simples pendant que vous réessayez.",
    action: { label: "Réessayer le téléchargement", onClick: () => {} },
    secondaryAction: { label: "Continuer avec les règles", onClick: () => {} },
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    title: "アシスタントのモデルをダウンロードできませんでした",
    description: "再試行する間も、簡単なルールで整理を続けられます。",
    action: { label: "ダウンロードを再試行", onClick: () => {} },
    secondaryAction: { label: "ルールで続ける", onClick: () => {} },
  },
};
