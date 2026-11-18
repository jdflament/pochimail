import type { MessageKey } from "@pochimail/ui/i18n/messages.ts";
import type { OutputOf } from "../../../../shared/ipc/contract.ts";

export type OverviewData = OutputOf<"overview.get">;
type Cleanable = OverviewData["cleanable"][number]["category"];

export const RECOMMENDATION_COPY: Record<Cleanable, { sentence: MessageKey; reason: MessageKey }> =
  {
    newsletters: {
      sentence: "overview.rec.newsletters.sentence",
      reason: "overview.rec.newsletters.reason",
    },
    promotions: {
      sentence: "overview.rec.promotions.sentence",
      reason: "overview.rec.promotions.reason",
    },
    notifications: {
      sentence: "overview.rec.notifications.sentence",
      reason: "overview.rec.notifications.reason",
    },
    "sign-ins-security": {
      sentence: "overview.rec.signins.sentence",
      reason: "overview.rec.signins.reason",
    },
  };

export type OverviewView = "loading" | "empty" | "content";

/** What the screen shows: skeletons until the first answer, the empty state for an account with no emails, else the figures. */
export const overviewView = (data: OverviewData | undefined, scanning: boolean): OverviewView => {
  if (data === undefined) return "loading";
  return data.scanned === 0 && !scanning ? "empty" : "content";
};

/** Emails Pochi could clean, and the rest of the scanned emails (worth keeping). */
export const cleanSplit = (data: OverviewData) => {
  const cleanable = data.cleanable.reduce((sum, item) => sum + item.count, 0);
  return { cleanable, keep: Math.max(0, data.scanned - cleanable) };
};
