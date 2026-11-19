import { RadioGroup, RadioGroupItem } from "@pochimail/ui/components/radio-group";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/RadioGroup",
  component: RadioGroup,
  args: { defaultValue: "ask", "aria-label": "When Pochi finds clutter" },
  render: (args) => (
    <RadioGroup {...args}>
      {[
        ["ask", "Ask me first"],
        ["tidy", "Keep it tidy"],
      ].map(([value, label]) => (
        <div key={value} className="flex items-center gap-2 text-ui">
          <RadioGroupItem id={`radio-${value}`} value={value ?? ""} />
          <label htmlFor={`radio-${value}`}>{label}</label>
        </div>
      ))}
    </RadioGroup>
  ),
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
