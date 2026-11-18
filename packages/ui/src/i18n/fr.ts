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
  "scan.failed": entry(
    "Je n'ai pas pu finir le tri. Rien n'a été modifié. Relancez-le et je reprendrai là où je me suis arrêté.",
    [],
  ),
  "overview.review": entry("Examiner", []),
  "overview.pause": entry("Pause", []),
  "overview.resume": entry("Reprendre", []),
  "overview.viewSummary": entry("Voir le résumé", []),
  "overview.catch.title": entry("Ce qui compte vraiment", []),
  "overview.clean.title": entry("Faire le tri", []),
  "summary.from": entry("De Pochi · {date, date, long} · sur votre {device}", ["date", "device"]),

  "shell.loading": entry("Démarrage…", []),
  "shell.error.title": entry("Un problème est survenu", []),
  "shell.error.body": entry(
    "Pochimail a rencontré un problème. Fermez et rouvrez l’application pour réessayer.",
    [],
  ),

  "welcome.title": entry("Bienvenue", []),
  "welcome.headline": entry("Faites le tri dans vos emails. Gardez l’essentiel.", []),

  "connect.title": entry("Connexion", []),
  "connect.description": entry("Connectez un compte email pour commencer.", []),

  "setup.title": entry("Configuration", []),
  "setup.description": entry("Choisissez comment Pochi peut vous aider.", []),

  "documents.title": entry("Documents", []),
  "documents.description": entry("Les documents enregistrés apparaîtront ici.", []),

  "activity.title": entry("Activité", []),
  "activity.description": entry(
    "Les actions récentes et l’historique d’annulation apparaîtront ici.",
    [],
  ),

  "settings.title": entry("Réglages", []),
  "settings.description": entry("Les préférences et les réglages du compte apparaîtront ici.", []),

  "category.placeholder": entry("Les emails de cette catégorie apparaîtront ici.", []),

  "devGallery.title": entry("Galerie de développement", []),
  "devGallery.description": entry("Aperçus des états et des animations pour le développement.", []),
  "action.close": entry("Fermer", []),
  "action.undo": entry("Annuler", []),
  "storageBar.description": entry("{summary} : {items}", ["summary", "items"]),
  "storageBar.descriptionItem": entry("{size} {label}", ["size", "label"]),
  "storageBar.itemSeparator": entry(", ", []),
  "storageBar.legendItem": entry("{label} · {size}", ["label", "size"]),
} satisfies Catalog;
