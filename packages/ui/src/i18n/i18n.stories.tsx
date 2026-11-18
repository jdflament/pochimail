import { PseudoLocalePreview } from "@pochimail/ui/i18n/pseudo-locale-preview.tsx";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { narrowDecorator } from "../components/story-utils.tsx";

const meta = {
  title: "I18n/Catalog",
  component: PseudoLocalePreview,
  decorators: [narrowDecorator],
} satisfies Meta<typeof PseudoLocalePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = { args: { locale: "en" } };
// Long, accented copy in a 320px container: FR/JA expansion must wrap, not overflow.
export const PseudoLocale: Story = {};
