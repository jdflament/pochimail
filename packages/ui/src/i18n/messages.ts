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
  "setup.bubble": entry(
    "Hi, I'm Pochi. Tell me what to help with and how much I'm allowed to do. You can change this anytime in Settings.",
    [],
  ),
  "setup.capabilities.heading": entry("What should I help with?", []),
  "setup.capabilities.hint": entry("Choose any", []),
  "setup.capability.catch-what-matters.title": entry("Catch what matters", []),
  "setup.capability.catch-what-matters.description": entry(
    "Flag people waiting on you, deadlines and important senders.",
    [],
  ),
  "setup.capability.declutter.title": entry("Declutter", []),
  "setup.capability.declutter.description": entry(
    "Unsubscribe and archive what you don't need.",
    [],
  ),
  "setup.capability.organize.title": entry("Organize", []),
  "setup.capability.organize.description": entry(
    "Sort email into clear categories and topics, as labels.",
    [],
  ),
  "setup.capability.save-documents.title": entry("Save documents", []),
  "setup.capability.save-documents.description": entry(
    "Find attachments that matter and keep them in a folder.",
    [],
  ),
  "setup.autonomy.heading": entry("How much can I do?", []),
  "setup.autonomy.recommended": entry("Recommended", []),
  "setup.autonomy.just-look.title": entry("Just look", []),
  "setup.autonomy.just-look.description": entry("I show you, but never change anything.", []),
  "setup.autonomy.suggest.title": entry("Suggest", []),
  "setup.autonomy.suggest.description": entry("I prepare, you approve each step.", []),
  "setup.autonomy.autopilot.title": entry("Autopilot", []),
  "setup.autonomy.autopilot.description": entry("I handle the obvious, then tell you.", []),
  "setup.autonomy.autopilot.reminder": entry(
    "With Autopilot I only archive or unsubscribe when I'm at least {percent}% sure, and I never touch email from real people. I log everything and report it afterward. You can undo it, except an unsubscribe.",
    ["percent"],
  ),
  "setup.invariants": entry(
    "In every mode, I never delete anything and never act on email from real people without asking. I log every action, and you can undo any of them except an unsubscribe.",
    [],
  ),
  "setup.capabilities.none": entry("Choose at least one thing for me to help with.", []),
  "setup.settingsError": entry("I couldn't load your choices.", []),
  "setup.retry": entry("Try again", []),
  "setup.start": entry("Start sorting", []),
  "setup.error": entry("I couldn't start sorting. Please try again.", []),

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
