import { Button } from "@pochimail/ui/components/button";
import { Mascot } from "@pochimail/ui/components/mascot";
import { OnboardingStepper } from "@pochimail/ui/components/onboarding-stepper";
import { t } from "@pochimail/ui/i18n/format.ts";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { darkDecorator, lightDecorator } from "./story-utils";

const meta = {
  title: "Components/OnboardingStepper",
  component: OnboardingStepper,
  decorators: [lightDecorator],
  args: { total: 3, current: 1, label: "Step 1 of 3" },
} satisfies Meta<typeof OnboardingStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstStep: Story = {};
export const Dark: Story = { decorators: [darkDecorator] };

// Click to see the active step stretch (220ms; instant with reduced motion).
export const Interactive: Story = {
  render: () => {
    const [current, setCurrent] = useState(1);
    return (
      <button type="button" onClick={() => setCurrent((c) => (c % 3) + 1)}>
        <OnboardingStepper total={3} current={current} label={`Step ${current} of 3`} />
      </button>
    );
  },
};

// The Welcome screen as composed in the desktop app: stepper, Pochi, headline, one button.
export const WelcomeScreen: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex justify-center pt-6">
        <OnboardingStepper
          total={3}
          current={1}
          label={t("onboarding.progress", { current: 1, total: 3 })}
        />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
        <Mascot size="lg" />
        <h1 className="mt-8 text-balance text-[40px] leading-tight">{t("welcome.headline")}</h1>
        <p className="mt-6 text-pretty leading-relaxed text-muted-foreground">
          {t("welcome.description", { device: "Mac" })}
        </p>
        <Button size="lg" className="mt-8 w-full max-w-[26rem]">
          {t("welcome.cta")}
        </Button>
        <p className="mt-4 text-sm text-foreground-tertiary">{t("welcome.openSource")}</p>
      </main>
    </div>
  ),
};
