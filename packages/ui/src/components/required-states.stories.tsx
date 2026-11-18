import {
  EmptyCategoryState,
  ModelDownloadFailedState,
  NeedsReconnectState,
  NothingToDoState,
  OfflineStatusLine,
  RateLimitState,
  SignInCancelledState,
  UpdateReadyState,
} from "@pochimail/ui/components/required-states";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { darkDecorator } from "./story-utils";

const noop = () => {};

const meta = {
  title: "States/Required states",
  decorators: [
    (Story) => (
      <div className="w-[340px] max-w-full p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignInCancelled: Story = {
  render: () => <SignInCancelledState onAction={noop} onSecondary={noop} />,
};
export const Offline: Story = { render: () => <OfflineStatusLine onAction={noop} /> };
export const NeedsReconnecting: Story = {
  render: () => <NeedsReconnectState provider="Gmail" onAction={noop} onSecondary={noop} />,
};
export const ModelDownloadFailed: Story = {
  render: () => <ModelDownloadFailedState onAction={noop} onSecondary={noop} />,
};
export const RateLimit: Story = {
  render: () => <RateLimitState provider="Google" minutes={4} onAction={noop} />,
};
export const EmptyCategory: Story = { render: () => <EmptyCategoryState onAction={noop} /> };
export const NothingToDo: Story = { render: () => <NothingToDoState onAction={noop} /> };
export const UpdateReady: Story = {
  render: () => <UpdateReadyState version="1.2" onAction={noop} onSecondary={noop} />,
};

const dark = [darkDecorator];
export const SignInCancelledDark: Story = { ...SignInCancelled, decorators: dark };
export const OfflineDark: Story = { ...Offline, decorators: dark };
export const NeedsReconnectingDark: Story = { ...NeedsReconnecting, decorators: dark };
export const ModelDownloadFailedDark: Story = { ...ModelDownloadFailed, decorators: dark };
export const RateLimitDark: Story = { ...RateLimit, decorators: dark };
export const EmptyCategoryDark: Story = { ...EmptyCategory, decorators: dark };
export const NothingToDoDark: Story = { ...NothingToDo, decorators: dark };
export const UpdateReadyDark: Story = { ...UpdateReady, decorators: dark };
