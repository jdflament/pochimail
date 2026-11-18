import { PillRadioGroup, PillRadioGroupItem } from "@pochimail/ui/components/pill-radio-group";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

function Cadence({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <PillRadioGroup aria-label={label} defaultValue="weekly">
      {items.map(([value, text]) => (
        <PillRadioGroupItem key={value} value={value}>
          {text}
        </PillRadioGroupItem>
      ))}
    </PillRadioGroup>
  );
}

const en: [string, string][] = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["never", "Only when I ask"],
];

const meta = {
  title: "Components/PillRadioGroup",
  component: PillRadioGroup,
  decorators: [lightDecorator],
  render: () => <Cadence label="Keep it tidy" items={en} />,
} satisfies Meta<typeof PillRadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Light: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  render: () => (
    <Cadence
      label="Garder en ordre"
      items={[
        ["daily", "Tous les jours"],
        ["weekly", "Toutes les semaines"],
        ["monthly", "Tous les mois"],
        ["never", "Seulement sur demande"],
      ]}
    />
  ),
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  render: () => (
    <Cadence
      label="整理の頻度"
      items={[
        ["daily", "毎日"],
        ["weekly", "毎週"],
        ["monthly", "毎月"],
        ["never", "頼んだときだけ"],
      ]}
    />
  ),
};
