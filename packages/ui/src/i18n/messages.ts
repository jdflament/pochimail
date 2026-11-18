/** English is the only v1 locale; every user-facing string lives here so FR/JA need no code changes. */
export type Locale = "en" | "pseudo";

const entry = <const Params extends readonly string[]>(text: string, params: Params) => ({
  text,
  params,
});

/**
 * ICU-style patterns: `{name}`, `{name, number}` and
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
} as const;

export type MessageKey = keyof typeof messages;

/** Params are derived from the catalog entry, so a renamed placeholder breaks the call site. */
export type MessageValues<K extends MessageKey> = {
  readonly [Param in (typeof messages)[K]["params"][number]]: string | number;
};
