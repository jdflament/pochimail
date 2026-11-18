import { StorageBar, type StorageSegment } from "@pochimail/ui/components/storage-bar";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator, lightDecorator, narrowDecorator } from "./story-utils";

const segments: StorageSegment[] = [
  { id: "keep", label: "Worth keeping", value: 33, size: "3.3 GB", pattern: "solid" },
  { id: "clean", label: "Can be cleaned", value: 31, size: "3.1 GB", pattern: "hatched" },
];

const meta = {
  title: "Components/StorageBar",
  component: StorageBar,
  decorators: [lightDecorator],
  args: { segments, summary: "6.4 GB used" },
} satisfies Meta<typeof StorageBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };
export const LongFrench: Story = {
  decorators: [narrowDecorator],
  args: {
    summary: "6,4 Go utilisés",
    segments: [
      {
        id: "keep",
        label: "À conserver précieusement",
        value: 33,
        size: "3,3 Go",
        pattern: "solid",
      },
      {
        id: "clean",
        label: "Peut être nettoyé en toute sécurité",
        value: 31,
        size: "3,1 Go",
        pattern: "hatched",
      },
    ],
  },
};
export const LongJapanese: Story = {
  decorators: [narrowDecorator],
  args: {
    summary: "6.4 GB 使用中",
    segments: [
      {
        id: "keep",
        label: "残しておく価値のあるもの",
        value: 33,
        size: "3.3 GB",
        pattern: "solid",
      },
      { id: "clean", label: "整理できるもの", value: 31, size: "3.1 GB", pattern: "hatched" },
    ],
  },
};
