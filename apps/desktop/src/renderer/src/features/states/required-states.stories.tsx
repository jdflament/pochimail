import { darkDecorator } from "@pochimail/ui/components/story-utils";
import type * as React from "react";
import {
  EmptyCategoryState,
  ModelDownloadFailedState,
  NeedsReconnectState,
  NothingToDoState,
  OfflineStatusLine,
  RateLimitState,
  SignInCancelledState,
  UpdateReadyState,
} from "./required-states.tsx";

const noop = () => {};

export default {
  title: "States/Required states",
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="w-[340px] max-w-full p-6">
        <Story />
      </div>
    ),
  ],
};

export const SignInCancelled = {
  render: () => <SignInCancelledState onAction={noop} onSecondary={noop} />,
};
export const Offline = { render: () => <OfflineStatusLine offline onAction={noop} /> };
export const NeedsReconnecting = {
  render: () => <NeedsReconnectState provider="Gmail" onAction={noop} onSecondary={noop} />,
};
export const ModelDownloadFailed = {
  render: () => <ModelDownloadFailedState onAction={noop} onSecondary={noop} />,
};
export const RateLimit = {
  render: () => <RateLimitState provider="Google" minutes={4} onAction={noop} />,
};
export const EmptyCategory = { render: () => <EmptyCategoryState onAction={noop} /> };
export const NothingToDo = { render: () => <NothingToDoState onAction={noop} /> };
export const UpdateReady = {
  render: () => <UpdateReadyState version="1.2" onAction={noop} onSecondary={noop} />,
};

const dark = [darkDecorator];
export const SignInCancelledDark = { ...SignInCancelled, decorators: dark };
export const OfflineDark = { ...Offline, decorators: dark };
export const NeedsReconnectingDark = { ...NeedsReconnecting, decorators: dark };
export const ModelDownloadFailedDark = { ...ModelDownloadFailed, decorators: dark };
export const RateLimitDark = { ...RateLimit, decorators: dark };
export const EmptyCategoryDark = { ...EmptyCategory, decorators: dark };
export const NothingToDoDark = { ...NothingToDo, decorators: dark };
export const UpdateReadyDark = { ...UpdateReady, decorators: dark };
