import { RecommendationRow } from "@pochimail/ui/components/recommendation-row";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/RecommendationRow",
  component: RecommendationRow,
  decorators: [lightDecorator],
  args: {
    sentence: "Unsubscribe from 120 newsletters",
    reason: "You haven’t opened any of them in 6 months. 10,410 emails.",
    size: "1.2 GB",
  },
  render: (args) => (
    <ul className="m-0 border-y border-border p-0">
      <RecommendationRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof RecommendationRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const Narrow: Story = { decorators: [narrowDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    sentence: "Se désabonner de 120 newsletters que vous ne lisez plus",
    reason: "Vous n’en avez ouvert aucune depuis six mois. 10 410 emails.",
    size: "1,2 Go",
    reviewLabel: "Examiner",
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    sentence: "120件のニュースレターの配信を停止する",
    reason: "6か月間、一度も開いていません。10,410件のメール。",
    size: "1.2 GB",
    reviewLabel: "確認する",
  },
};
