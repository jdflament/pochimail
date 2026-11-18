import { SpeechBubble } from "@pochimail/ui/components/speech-bubble";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/SpeechBubble",
  component: SpeechBubble,
  decorators: [lightDecorator],
  args: {
    pose: "default",
    children:
      "Hi, I’m Pochi. Tell me what to help with and how much I’m allowed to do. You can change this anytime in Settings.",
  },
} satisfies Meta<typeof SpeechBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    children:
      "Bonjour, je suis Pochi. Dites-moi en quoi je peux aider et jusqu’où je peux aller. Vous pourrez le modifier à tout moment dans les réglages.",
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    pose: "happy",
    children:
      "こんにちは、Pochiです。どんなお手伝いが必要か、どこまで任せてもらえるかを教えてください。設定でいつでも変更できます。",
  },
};
