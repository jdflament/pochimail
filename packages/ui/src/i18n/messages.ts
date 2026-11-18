/**
 * English is the default and the fallback. French and Japanese ship in v1 (P13, JD 2026-11-19);
 * every user-facing string lives in a catalog so more languages need no code changes.
 */
const USER_LOCALES = ["en", "fr", "ja"] as const;

export type UserLocale = (typeof USER_LOCALES)[number];

/** `pseudo` is a dev-only layout probe: never user-selectable, never shipped as a choice. */
export type Locale = UserLocale | "pseudo";

export type MessageEntry = { readonly text: string; readonly params: readonly string[] };

/** Catalog authoring helper: the tuple keeps `{placeholders}` typed (code: `{name, plural, ...}`). */
export const entry = <const Params extends readonly string[]>(text: string, params: Params) => ({
  text,
  params,
});

/**
 * ICU-style patterns: `{name}`, `{name, number}`, `{name, date, long}` and
 * `{name, plural, =0 {...} one {...} other {...}}`.
 * Voice: "email"/"emails", "Pochi"/"I", functional titles, `{device}` for the host.
 */
export const messages = {
  "action.close": entry("Close", []),
  "action.undo": entry("Undo", []),
  "overview.title": entry("Overview", []),
  "overview.privacy": entry("Everything stays on this device. Nothing is sent anywhere.", []),
  "overview.promise.device": entry("Your email never leaves this {device}.", ["device"]),
  "overview.sorting": entry("Sorting privately on this {device}", ["device"]),
  "overview.worker.connecting": entry("Starting the background worker…", []),
  "overview.worker.ready": entry("Background worker ready.", []),
  "overview.worker.unavailable": entry("The background worker is not responding.", []),
  "overview.email.count": entry("{count, plural, =0 {No emails} one {# email} other {# emails}}", [
    "count",
  ]),
  "overview.size.free": entry("{size, number} GB you can free, out of {total, number} GB", [
    "size",
    "total",
  ]),
  "scan.failed": entry(
    "I could not finish sorting. Nothing was changed. Start again and I will continue where I stopped.",
    [],
  ),
  "overview.review": entry("Review", []),
  "overview.pause": entry("Pause", []),
  "overview.resume": entry("Resume", []),
  "overview.viewSummary": entry("View summary", []),
  "overview.catch.title": entry("Catch what matters", []),
  "overview.clean.title": entry("Clean up", []),
  "summary.from": entry("From Pochi · {date, date, long} · on this {device}", ["date", "device"]),
  "summary.title": entry("While you were away", []),
  "summary.sentence": entry(
    "{count, plural, one {I sorted # new email.} other {I sorted # new emails.}} Nothing was deleted.",
    ["count"],
  ),
  "summary.figure.sorted": entry("sorted", []),
  "summary.figure.review": entry("to review", []),
  "summary.figure.free": entry("to free", []),
  "summary.tidy": entry("Keep it tidy", []),
  "summary.tidy.weekly": entry("Weekly", []),
  "summary.tidy.daily": entry("Daily", []),
  "summary.later": entry("Later", []),
  "summary.reviewCount": entry("{count, plural, one {Review # email} other {Review # emails}}", [
    "count",
  ]),

  "shell.loading": entry("Starting…", []),
  "shell.error.title": entry("Something went wrong", []),
  "shell.error.body": entry("Pochimail hit a problem. Close and reopen the app to try again.", []),

  "welcome.headline": entry("Clean up your email. Keep what matters.", []),
  "welcome.description": entry(
    "Pochimail is a private assistant for the email accounts you already have. It flags what needs you, clears the clutter and saves your documents. Your email never leaves this {device}.",
    ["device"],
  ),
  "welcome.cta": entry("Get started", []),
  "welcome.openSource": entry("Free and open source", []),
  "onboarding.progress": entry("Step {current} of {total}", ["current", "total"]),

  "connect.title": entry("Connect", []),
  "connect.description": entry("Connect an email account to get started.", []),

  "setup.title": entry("Set up", []),
  "setup.description": entry("Choose how Pochi can help.", []),

  "documents.title": entry("Documents", []),
  "documents.description": entry("Saved documents will appear here.", []),

  "activity.title": entry("Activity", []),
  "activity.description": entry("Recent actions and undo history will appear here.", []),

  "settings.title": entry("Settings", []),
  "settings.description": entry("Preferences and account settings will appear here.", []),

  "nav.brand": entry("Pochimail", []),
  "nav.label": entry("Main navigation", []),
  "nav.email": entry("Email", []),
  "nav.tools": entry("Tools", []),
  "nav.teams": entry("Teams", []),
  "nav.soon": entry("Soon", []),
  "switcher.menu": entry("Account", []),
  "switcher.all": entry("All accounts", []),
  "switcher.add": entry("Add another account", []),
  "category.people": entry("People", []),
  "category.records": entry("Records", []),
  "category.purchasesTravel": entry("Purchases & travel", []),
  "category.signInsSecurity": entry("Sign-ins & security", []),
  "category.notifications": entry("Notifications", []),
  "category.newsletters": entry("Newsletters", []),
  "category.promotions": entry("Promotions", []),
  "category.placeholder": entry("Emails in this category will appear here.", []),

  "devGallery.title": entry("Dev gallery", []),
  "devGallery.description": entry("States and motion previews for development.", []),
  "storageBar.description": entry("{summary}: {items}", ["summary", "items"]),
  "storageBar.descriptionItem": entry("{size} {label}", ["size", "label"]),
  "storageBar.itemSeparator": entry(", ", []),
  "storageBar.legendItem": entry("{label} · {size}", ["label", "size"]),
} as const;

export type MessageKey = keyof typeof messages;

/** Params are derived from the catalog entry, so a renamed placeholder breaks the call site. */
export type MessageValues<K extends MessageKey> = {
  readonly [Param in (typeof messages)[K]["params"][number]]: string | number;
};

/**
 * A shipped catalog must cover every English key with the same placeholders, so a missing
 * translation (or a dropped `{device}`) fails typecheck instead of silently showing English.
 */
export type Catalog = {
  readonly [K in MessageKey]: {
    readonly text: string;
    readonly params: (typeof messages)[K]["params"];
  };
};
