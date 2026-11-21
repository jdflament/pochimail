/** Overview Clean up copy per locale: the rows, sizes and units. Plain objects, spread into the catalogs like the Connect copy. */
export const overviewCleanMessages = {
  en: {
    "overview.clean.freeing": {
      text: "you can free by deleting, out of {total} across {count, plural, one {# account} other {# accounts}}",
      params: ["total", "count"],
    },
    "overview.clean.noSpace": { text: "These don’t free space", params: [] },
    "overview.clean.sizeUnknown": {
      text: "I don’t know the size of your {provider} emails yet, so I can’t tell how much space deleting would free.",
      params: ["provider"],
    },
    "overview.size.gb": { text: "{size, number} GB", params: ["size"] },
    "overview.size.mb": { text: "{size, number} MB", params: ["size"] },
    "overview.size.unknown": { text: "Not known yet", params: [] },
    "overview.unit.senders": {
      text: "{count, plural, one {# sender} other {# senders}}",
      params: ["count"],
    },
    "overview.unit.files": {
      text: "{count, plural, one {# file} other {# files}}",
      params: ["count"],
    },
    "overview.row.deletePromotions.sentence": {
      text: "Delete {count, number} old promotions",
      params: ["count"],
    },
    "overview.row.deletePromotions.reason": {
      text: "Sales emails older than 90 days that you never opened.",
      params: [],
    },
    "overview.row.deleteNotifications.sentence": {
      text: "Delete {count, number} old notifications",
      params: ["count"],
    },
    "overview.row.deleteNotifications.reason": {
      text: "App and social alerts older than 90 days.",
      params: [],
    },
    "overview.row.deleteSignins.sentence": {
      text: "Delete {count, number} expired sign-in codes",
      params: ["count"],
    },
    "overview.row.deleteSignins.reason": {
      text: "One-time codes and login alerts older than 90 days.",
      params: [],
    },
    "overview.row.unsubscribeNewsletters.sentence": {
      text: "Unsubscribe from {count, number} newsletters",
      params: ["count"],
    },
    "overview.row.unsubscribeNewsletters.reason": {
      text: "You haven’t opened any of them in 6 months.",
      params: [],
    },
    "overview.row.archiveNotifications.sentence": {
      text: "Archive {count, number} old notifications",
      params: ["count"],
    },
    "overview.row.archiveNotifications.reason": {
      text: "App and social alerts older than 30 days.",
      params: [],
    },
    "overview.row.saveRecords.sentence": {
      text: "Save {count, number} attachments",
      params: ["count"],
    },
    "overview.row.saveRecords.reason": { text: "Keep them in your own storage.", params: [] },
    "overview.provider.google": { text: "Gmail", params: [] },
    "overview.provider.microsoft": { text: "Outlook", params: [] },
  },
  fr: {
    "overview.clean.freeing": {
      text: "à libérer en supprimant, sur {total} répartis sur {count, plural, one {# compte} other {# comptes}}",
      params: ["total", "count"],
    },
    "overview.clean.noSpace": { text: "Ceci ne libère pas d’espace", params: [] },
    "overview.clean.sizeUnknown": {
      text: "Je ne connais pas encore la taille de vos emails {provider}, je ne peux donc pas dire combien d’espace la suppression libérerait.",
      params: ["provider"],
    },
    "overview.size.gb": { text: "{size, number} Go", params: ["size"] },
    "overview.size.mb": { text: "{size, number} Mo", params: ["size"] },
    "overview.size.unknown": { text: "Pas encore connue", params: [] },
    "overview.unit.senders": {
      text: "{count, plural, one {# expéditeur} other {# expéditeurs}}",
      params: ["count"],
    },
    "overview.unit.files": {
      text: "{count, plural, one {# fichier} other {# fichiers}}",
      params: ["count"],
    },
    "overview.row.deletePromotions.sentence": {
      text: "Supprimer {count, number} anciennes promotions",
      params: ["count"],
    },
    "overview.row.deletePromotions.reason": {
      text: "Des emails de vente vieux de plus de 90 jours que vous n’avez jamais ouverts.",
      params: [],
    },
    "overview.row.deleteNotifications.sentence": {
      text: "Supprimer {count, number} anciennes notifications",
      params: ["count"],
    },
    "overview.row.deleteNotifications.reason": {
      text: "Des alertes d’applications et de réseaux sociaux vieilles de plus de 90 jours.",
      params: [],
    },
    "overview.row.deleteSignins.sentence": {
      text: "Supprimer {count, number} codes de connexion expirés",
      params: ["count"],
    },
    "overview.row.deleteSignins.reason": {
      text: "Des codes à usage unique et des alertes de connexion vieux de plus de 90 jours.",
      params: [],
    },
    "overview.row.unsubscribeNewsletters.sentence": {
      text: "Se désabonner de {count, number} newsletters",
      params: ["count"],
    },
    "overview.row.unsubscribeNewsletters.reason": {
      text: "Vous n’en avez ouvert aucune depuis 6 mois.",
      params: [],
    },
    "overview.row.archiveNotifications.sentence": {
      text: "Archiver {count, number} anciennes notifications",
      params: ["count"],
    },
    "overview.row.archiveNotifications.reason": {
      text: "Des alertes d’applications et de réseaux sociaux vieilles de plus de 30 jours.",
      params: [],
    },
    "overview.row.saveRecords.sentence": {
      text: "Enregistrer {count, number} pièces jointes",
      params: ["count"],
    },
    "overview.row.saveRecords.reason": {
      text: "Gardez-les dans votre propre stockage.",
      params: [],
    },
    "overview.provider.google": { text: "Gmail", params: [] },
    "overview.provider.microsoft": { text: "Outlook", params: [] },
  },
  ja: {
    "overview.clean.freeing": {
      text: "削除で空けられます（{count, plural, other {#個のアカウント}}で合計{total}）",
      params: ["total", "count"],
    },
    "overview.clean.noSpace": { text: "空き容量は増えません", params: [] },
    "overview.clean.sizeUnknown": {
      text: "{provider}のメールのサイズがまだ分からないため、削除でどれだけ空くかは分かりません。",
      params: ["provider"],
    },
    "overview.size.gb": { text: "{size, number} GB", params: ["size"] },
    "overview.size.mb": { text: "{size, number} MB", params: ["size"] },
    "overview.size.unknown": { text: "まだ不明", params: [] },
    "overview.unit.senders": { text: "{count, plural, other {#件の送信元}}", params: ["count"] },
    "overview.unit.files": { text: "{count, plural, other {#個のファイル}}", params: ["count"] },
    "overview.row.deletePromotions.sentence": {
      text: "古い広告メール{count, number}件を削除する",
      params: ["count"],
    },
    "overview.row.deletePromotions.reason": {
      text: "90日より前の、開いたことのないセールのメールです。",
      params: [],
    },
    "overview.row.deleteNotifications.sentence": {
      text: "古い通知{count, number}件を削除する",
      params: ["count"],
    },
    "overview.row.deleteNotifications.reason": {
      text: "90日より前のアプリやSNSからの通知です。",
      params: [],
    },
    "overview.row.deleteSignins.sentence": {
      text: "期限切れのログイン用コード{count, number}件を削除する",
      params: ["count"],
    },
    "overview.row.deleteSignins.reason": {
      text: "90日より前のワンタイムコードとログインの通知です。",
      params: [],
    },
    "overview.row.unsubscribeNewsletters.sentence": {
      text: "ニュースレター{count, number}件の配信を停止する",
      params: ["count"],
    },
    "overview.row.unsubscribeNewsletters.reason": {
      text: "6か月間、どれも開いていません。",
      params: [],
    },
    "overview.row.archiveNotifications.sentence": {
      text: "古い通知{count, number}件をアーカイブする",
      params: ["count"],
    },
    "overview.row.archiveNotifications.reason": {
      text: "30日より前のアプリやSNSからの通知です。",
      params: [],
    },
    "overview.row.saveRecords.sentence": {
      text: "添付ファイル{count, number}件を保存する",
      params: ["count"],
    },
    "overview.row.saveRecords.reason": { text: "ご自身のストレージに保管します。", params: [] },
    "overview.provider.google": { text: "Gmail", params: [] },
    "overview.provider.microsoft": { text: "Outlook", params: [] },
  },
} as const;
