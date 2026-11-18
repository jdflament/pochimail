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
  "overview.review": entry("Review", []),
  "overview.pause": entry("Pause", []),
  "overview.resume": entry("Resume", []),
  "overview.viewSummary": entry("View summary", []),
  "overview.catch.title": entry("Catch what matters", []),
  "overview.clean.title": entry("Clean up", []),
  "summary.from": entry("From Pochi · {date, date, long} · on this {device}", ["date", "device"]),
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
