import { SignalRow } from "@pochimail/ui/components/signal-row";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/SignalRow",
  component: SignalRow,
  decorators: [lightDecorator],
  args: { figure: 7, title: "people are waiting on you", detail: "The oldest has waited 9 days" },
  render: (args) => (
    <ul className="m-0 border-y border-border p-0">
      <SignalRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof SignalRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithoutDetail: Story = { args: { detail: undefined } };
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    figure: 12,
    title: "personnes attendent encore une réponse de votre part",
    detail: "La plus ancienne attend depuis neuf jours",
    reviewLabel: "Examiner",
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    figure: 12,
    title: "人があなたの返信を待っています",
    detail: "最も古いものは9日間待っています",
    reviewLabel: "確認する",
  },
};
