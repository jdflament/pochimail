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
import { useState } from "react";

const meta = {
  title: "Components/Sheet",
  component: Sheet,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The summary content is composed later in the feature (M4-15); this shows the sheet fits it with plain primitives. */
const SummarySheet = ({
  container,
  ...args
}: React.ComponentProps<typeof Sheet> & { container?: HTMLElement | null }) => (
  <Sheet {...args}>
    <SheetTrigger asChild>
      <Button variant="secondary">{t("overview.viewSummary")}</Button>
    </SheetTrigger>
    <SheetContent container={container}>
      <SheetHeader>
        <p className="text-sm text-muted-foreground">
          {t("summary.from", { date: "2026-11-19T12:00:00Z", device: "Mac" })}
        </p>
        <SheetTitle>{t("summary.title")}</SheetTitle>
        <SheetDescription>{t("summary.sentence", { count: 128 })}</SheetDescription>
      </SheetHeader>
      <dl className="grid grid-cols-3 gap-4">
        {[
          ["128", t("summary.figure.sorted")],
          ["9", t("summary.figure.review")],
          ["340 MB", t("summary.figure.free")],
        ].map(([figure, label]) => (
          <div key={label}>
            <dd className="font-display text-3xl tabular-nums">{figure}</dd>
            <dt className="text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <PillRadioGroup defaultValue="weekly" aria-label={t("summary.tidy")}>
        <PillRadioGroupItem value="weekly">{t("summary.tidy.weekly")}</PillRadioGroupItem>
        <PillRadioGroupItem value="daily">{t("summary.tidy.daily")}</PillRadioGroupItem>
      </PillRadioGroup>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="ghost">{t("summary.later")}</Button>
        </SheetClose>
        <Button>{t("summary.reviewCount", { count: 9 })}</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);

export const Desktop: Story = {
  render: (args) => <SummarySheet {...args} />,
  args: { defaultOpen: true },
};

/** Mounted inside a 390px frame (`contain` makes the fixed layer relative to it), so the bottom-sheet layout shows on any viewport. */
function PhoneFrame(args: React.ComponentProps<typeof Sheet>) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setFrame}
      className="relative h-[640px] w-[390px] overflow-hidden border"
      style={{ contain: "layout paint" }}
    >
      {frame ? <SummarySheet {...args} container={frame} /> : null}
    </div>
  );
}

export const Phone: Story = {
  render: (args) => <PhoneFrame {...args} />,
  args: { defaultOpen: true },
};
