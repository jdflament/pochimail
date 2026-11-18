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

  "welcome.headline": entry("Faites le tri dans vos emails. Gardez l’essentiel.", []),
  "welcome.description": entry(
    "Pochimail est un assistant privé pour les comptes email que vous avez déjà. Il repère ce qui a besoin de vous, fait le tri dans l’encombrement et enregistre vos documents. Vos emails ne quittent jamais votre {device}.",
    ["device"],
  ),
  "welcome.cta": entry("Commencer", []),
  "welcome.openSource": entry("Gratuit et open source", []),
  "onboarding.progress": entry("Étape {current} sur {total}", ["current", "total"]),

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

  "nav.brand": entry("Pochimail", []),
  "nav.label": entry("Navigation principale", []),
  "nav.email": entry("Email", []),
  "nav.tools": entry("Outils", []),
  "nav.teams": entry("Équipes", []),
  "nav.soon": entry("Bientôt", []),
  "switcher.menu": entry("Compte", []),
  "switcher.all": entry("Tous les comptes", []),
  "switcher.add": entry("Ajouter un autre compte", []),
  "category.people": entry("Personnes", []),
  "category.records": entry("Documents officiels", []),
  "category.purchasesTravel": entry("Achats et voyages", []),
  "category.signInsSecurity": entry("Connexions et sécurité", []),
  "category.notifications": entry("Notifications", []),
  "category.newsletters": entry("Newsletters", []),
  "category.promotions": entry("Promotions", []),
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
