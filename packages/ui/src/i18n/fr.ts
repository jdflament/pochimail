import { type Catalog, entry } from "./messages.ts";

/**
 * French catalog. Typed against the English keys: a missing key or a renamed placeholder fails
 * typecheck. Voice: warm and plain, "emails" (never "mails"), "Pochi"/"je" for the assistant.
 */
export const fr = {
  "overview.title": entry("Vue d’ensemble", []),
  "overview.privacy": entry("Tout reste sur cet appareil. Rien n’est envoyé nulle part.", []),
  "overview.promise.device": entry("Vos emails ne quittent jamais votre {device}.", ["device"]),
  "overview.sorting": entry("Je trie en privé sur votre {device}", ["device"]),
  "overview.worker.connecting": entry("Je prépare le travail en arrière-plan…", []),
  "overview.worker.ready": entry("Je suis prêt à travailler en arrière-plan.", []),
  "overview.worker.unavailable": entry("Je suis bloqué en arrière-plan.", []),
  "overview.email.count": entry(
    "{count, plural, =0 {Aucun email} one {# email} other {# emails}}",
    ["count"],
  ),
  "overview.size.free": entry("{size, number} Go à libérer, sur {total, number} Go", [
    "size",
    "total",
  ]),
  "overview.review": entry("Examiner", []),
  "overview.pause": entry("Pause", []),
  "overview.resume": entry("Reprendre", []),
  "overview.viewSummary": entry("Voir le résumé", []),
  "overview.catch.title": entry("Ce qui compte vraiment", []),
  "overview.clean.title": entry("Faire le tri", []),
  "summary.from": entry("De Pochi · {date, date, long} · sur votre {device}", ["date", "device"]),
} satisfies Catalog;
