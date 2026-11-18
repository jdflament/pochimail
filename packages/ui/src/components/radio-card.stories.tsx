import { RadioCard } from "@pochimail/ui/components/radio-card";
import { RadioGroup } from "@pochimail/ui/components/radio-group";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

type Copy = { label: string; look: string; suggest: string; auto: string; badge: string };

function Modes({ copy }: { copy: Copy }) {
  return (
    <RadioGroup aria-label={copy.label} defaultValue="suggest">
      <RadioCard
        value="look"
        title={copy.look}
        description="I show you, but never change anything."
      />
      <RadioCard
        value="suggest"
        title={copy.suggest}
        badge={copy.badge}
        description="I prepare, you approve each step."
      />
      <RadioCard
        value="auto"
        title={copy.auto}
        description="I handle the obvious, then tell you."
      />
    </RadioGroup>
  );
}

const en: Copy = {
  label: "How much can I do?",
  look: "Just look",
  suggest: "Suggest",
  auto: "Autopilot",
  badge: "Recommended",
};

const meta = {
  title: "Components/RadioCard",
  component: RadioCard,
  decorators: [lightDecorator],
  args: { value: "x", title: "x" },
  render: () => <Modes copy={en} />,
} satisfies Meta<typeof RadioCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRecommended: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  render: () => (
    <Modes
      copy={{
        label: "Jusqu’où puis-je aller ?",
        look: "Observer seulement",
        suggest: "Proposer",
        auto: "Pilote automatique",
        badge: "Recommandé",
      }}
    />
  ),
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  render: () => (
    <Modes
      copy={{
        label: "どこまで任せますか？",
        look: "見るだけ",
        suggest: "提案する",
        auto: "おまかせ",
        badge: "おすすめ",
      }}
    />
  ),
};
