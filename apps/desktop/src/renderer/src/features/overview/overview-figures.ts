import type { MessageKey } from "@pochimail/ui/i18n/messages.ts";
import type { OutputOf } from "#shared/ipc/contract.ts";

export type OverviewData = OutputOf<"overview.get">;
type CleanUpAction = OverviewData["actions"][number];

/** The sentence and reason of each Clean up row; every sentence takes `{count}`. */
type RowKey = Extract<MessageKey, `overview.row.${string}`>;
const ROW_COPY: Record<string, { sentence: RowKey; reason: RowKey }> = {
  "delete/promotions": {
    sentence: "overview.row.deletePromotions.sentence",
    reason: "overview.row.deletePromotions.reason",
  },
  "delete/notifications": {
    sentence: "overview.row.deleteNotifications.sentence",
    reason: "overview.row.deleteNotifications.reason",
  },
  "delete/sign-ins-security": {
    sentence: "overview.row.deleteSignins.sentence",
    reason: "overview.row.deleteSignins.reason",
  },
  "unsubscribe/newsletters": {
    sentence: "overview.row.unsubscribeNewsletters.sentence",
    reason: "overview.row.unsubscribeNewsletters.reason",
  },
  "archive/notifications": {
    sentence: "overview.row.archiveNotifications.sentence",
    reason: "overview.row.archiveNotifications.reason",
  },
  "save/records": {
    sentence: "overview.row.saveRecords.sentence",
    reason: "overview.row.saveRecords.reason",
  },
};

/** What the row's right-hand figure says: a size, "not known yet", or a count of what the action touches. */
export type RowFigure =
  | { readonly tag: "bytes"; readonly bytes: number }
  | { readonly tag: "unknown" }
  | { readonly tag: "emails" | "senders" | "files"; readonly count: number };

export interface ActionRow {
  readonly id: string;
  readonly kind: CleanUpAction["kind"];
  readonly category: CleanUpAction["category"];
  readonly count: number;
  readonly sentence: RowKey;
  readonly reason: RowKey;
  readonly figure: RowFigure;
}

const figureOf = (action: CleanUpAction): RowFigure => {
  if (action.kind === "delete")
    return action.bytes === null ? { tag: "unknown" } : { tag: "bytes", bytes: action.bytes };
  const tag = { archive: "emails", unsubscribe: "senders", save: "files" } as const;
  return { tag: tag[action.kind], count: action.count };
};

export interface CleanUpView {
  /** Rows that free space, then rows that do not. */
  readonly deletes: readonly ActionRow[];
  readonly others: readonly ActionRow[];
  /** The GB figure: the delete rows only, so archiving, unsubscribing and saving never change it. Null while any size is unknown. */
  readonly space: { readonly freeBytes: number; readonly totalBytes: number } | null;
}

/** The Clean up section from the read model's blocks; null when there is nothing to propose. */
export const cleanUpView = (data: OverviewData): CleanUpView | null => {
  const rows = data.actions.flatMap((action): ActionRow[] => {
    const copy = ROW_COPY[`${action.kind}/${action.category}`];
    if (copy === undefined || action.count === 0) return [];
    return [
      {
        id: `${action.kind}/${action.category}`,
        kind: action.kind,
        category: action.category,
        count: action.count,
        ...copy,
        figure: figureOf(action),
      },
    ];
  });
  if (rows.length === 0) return null;
  const deletes = data.actions.filter((a) => a.kind === "delete");
  const known = data.totalBytes !== null && deletes.every((a) => a.sizeKnown && a.bytes !== null);
  return {
    deletes: rows.filter((r) => r.kind === "delete"),
    others: rows.filter((r) => r.kind !== "delete"),
    space: known
      ? {
          freeBytes: deletes.reduce((sum, a) => sum + (a.bytes ?? 0), 0),
          totalBytes: data.totalBytes ?? 0,
        }
      : null,
  };
};

export interface SignalView {
  readonly id: "waiting" | "deadlines" | "important";
  readonly count: number;
  readonly title:
    | "overview.waiting.title"
    | "overview.deadlines.title"
    | "overview.important.title";
  readonly detail: MessageKey;
}

/** The Catch what matters rows with something to show, in display order. */
export const signalRows = (data: OverviewData): readonly SignalView[] =>
  (
    [
      {
        id: "waiting",
        count: data.waiting,
        title: "overview.waiting.title",
        detail: "overview.waiting.detail",
      },
      {
        id: "deadlines",
        count: data.deadlines,
        title: "overview.deadlines.title",
        detail: "overview.deadlines.detail",
      },
      {
        id: "important",
        count: data.important,
        title: "overview.important.title",
        detail: "overview.important.detail",
      },
    ] as const
  ).filter((row) => row.count > 0);

export type OverviewView = "loading" | "error" | "empty" | "content";

/** What the screen shows: skeletons until the first answer, an error with retry when the first answer failed, the empty state for an account with no emails, else the figures. */
export const overviewView = (
  data: OverviewData | undefined,
  scanning: boolean,
  failed: boolean,
): OverviewView => {
  if (data === undefined) return failed ? "error" : "loading";
  return data.scanned === 0 && !scanning ? "empty" : "content";
};

const GB = 1_000_000_000;
const MB = 1_000_000;
/** A size as the unit key and rounded value: GB with one decimal from 1 GB up, whole MB below. */
export const sizeParts = (
  bytes: number,
): { key: "overview.size.gb" | "overview.size.mb"; size: number } =>
  bytes >= GB
    ? { key: "overview.size.gb", size: Math.round(bytes / (GB / 10)) / 10 }
    : { key: "overview.size.mb", size: Math.round(bytes / MB) };
