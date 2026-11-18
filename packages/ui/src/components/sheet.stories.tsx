import { Button } from "@pochimail/ui/components/button";
import { PillRadioGroup, PillRadioGroupItem } from "@pochimail/ui/components/pill-radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pochimail/ui/components/sheet";
import { t } from "@pochimail/ui/i18n/format.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The summary content is composed later in the feature (M4-15); this shows the sheet fits it with plain primitives. */
const SummarySheet = (args: React.ComponentProps<typeof Sheet>) => (
  <Sheet {...args}>
    <SheetTrigger asChild>
      <Button variant="secondary">View summary</Button>
    </SheetTrigger>
    <SheetContent>
      <SheetHeader>
        <p className="text-sm text-muted-foreground">
          {t("summary.from", { date: "2026-11-19T12:00:00Z", device: "Mac" })}
        </p>
        <SheetTitle>While you were away</SheetTitle>
        <SheetDescription>I sorted 128 new emails. Nothing was deleted.</SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-3 gap-4">
        {[
          ["128", "sorted"],
          ["9", "to review"],
          ["340 MB", "to free"],
        ].map(([figure, label]) => (
          <div key={label}>
            <dd className="font-display text-3xl tabular-nums">{figure}</dd>
            <dt className="text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <PillRadioGroup defaultValue="weekly" aria-label="Keep it tidy">
        <PillRadioGroupItem value="weekly">Weekly</PillRadioGroupItem>
        <PillRadioGroupItem value="daily">Daily</PillRadioGroupItem>
      </PillRadioGroup>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="ghost">Later</Button>
        </SheetClose>
        <Button>Review 9 emails</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const Desktop: Story = {
  render: (args) => <SummarySheet {...args} />,
  args: { defaultOpen: true },
};

/** Same markup in a 390px frame: the sheet reads its own layer width and docks to the bottom. */
export const Phone: Story = {
  render: (args) => (
    <div className="h-[640px] w-[390px] overflow-hidden" style={{ contain: "layout paint" }}>
      <SummarySheet {...args} />
    </div>
  ),
  args: { defaultOpen: true },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
