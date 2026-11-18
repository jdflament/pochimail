import { Button } from "@pochimail/ui/components/button";
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
    const [paused, setPaused] = useState(false);
    return (
      <StatusStrip {...args}>
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm">View summary</Button>
      </StatusStrip>
    );
  },
} satisfies Meta<typeof StatusStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {};
export const Paused: Story = {
  args: { status: "Paused. Nothing was changed." },
  render: (args) => {
    const [paused, setPaused] = useState(true);
    return (
      <StatusStrip {...args}>
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm">View summary</Button>
      </StatusStrip>
    );
  },
};
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    headline: "Tri en cours, en privé, sur ce Mac",
    status: "214 emails étiquetés « Recherche d’emploi »",
  },
  render: (args) => {
    const [paused, setPaused] = useState(false);
    return (
      <StatusStrip {...args}>
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? "Reprendre" : "Mettre en pause"}
        </Button>
        <Button size="sm">Voir le résumé</Button>
      </StatusStrip>
    );
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    headline: "このMac上でプライベートに整理しています",
    status: "214件のメールに「求職活動」のラベルを付けました",
  },
  render: (args) => {
    const [paused, setPaused] = useState(false);
    return (
      <StatusStrip {...args}>
        <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
          {paused ? "再開" : "一時停止"}
        </Button>
        <Button size="sm">概要を見る</Button>
      </StatusStrip>
    );
  },
};
