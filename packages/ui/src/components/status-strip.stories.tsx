import { StatusStrip } from "@pochimail/ui/components/status-strip";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const meta = {
  title: "Components/StatusStrip",
  component: StatusStrip,
  decorators: [lightDecorator],
  args: {
    progress: 62,
    headline: "Sorting privately on this Mac",
    status: "Labeled 214 emails as Job search",
  },
  // Holds the paused state so the Pause/Resume toggle works in the story.
  render: (args) => {
    const [paused, setPaused] = useState(args.paused ?? false);
    return <StatusStrip {...args} paused={paused} onPausedChange={setPaused} />;
  },
} satisfies Meta<typeof StatusStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const Paused: Story = { args: { paused: true, status: "Paused. Nothing was changed." } };
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    headline: "Tri en cours, en privé, sur ce Mac",
    status: "214 emails étiquetés « Recherche d’emploi »",
    labels: { pause: "Mettre en pause", resume: "Reprendre", viewSummary: "Voir le résumé" },
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    headline: "このMac上でプライベートに整理しています",
    status: "214件のメールに「求職活動」のラベルを付けました",
    labels: { pause: "一時停止", resume: "再開", viewSummary: "概要を見る" },
  },
};
