// Deterministic synthetic mailbox for the M0-11 benchmark (EN / FR / JA).
// Every name, domain and amount is invented (example.* domains only): no real mail (AGENTS.md §5).

export const categories = [
  "people",
  "records",
  "purchases-travel",
  "sign-ins-security",
  "notifications",
  "newsletters",
  "promotions",
] as const;
export type Category = (typeof categories)[number];

export const languages = ["en", "fr", "ja"] as const;
export type Language = (typeof languages)[number];

export interface SyntheticEmail {
  id: string;
  language: Language;
  category: Category;
  from: string;
  subject: string;
  snippet: string;
  /** Ground truth for the extraction task: ISO date of the deadline stated in the snippet, or null. */
  deadline: string | null;
}

interface Template {
  from: string;
  subject: string;
  body: string;
  /** When true the body mentions {deadline} and the email carries that ground truth. */
  hasDeadline?: boolean;
}

// {n} {name} {amount} {deadline} are filled per email. Deadlines are formatted per language.
const templates: Record<Category, Record<Language, Template[]>> = {
  people: {
    en: [
      { from: "{name} <{first}@example.org>", subject: "Dinner on Saturday?", body: "Hi, are you free on Saturday evening? We were thinking of that new place near the park. Let me know what you think." },
      { from: "{name} <{first}@example.net>", subject: "Re: draft of the project plan", body: "Thanks for sending this over. I read it twice and I have two questions about the timeline. Could we talk tomorrow? I need your answer before {deadline} to book the room.", hasDeadline: true },
      { from: "{name} <{first}@example.com>", subject: "Photos from the weekend", body: "Finally sorted the photos from the trip, I will share the album tonight. You look great in the one at the lake." },
    ],
    fr: [
      { from: "{name} <{first}@example.org>", subject: "Dîner samedi ?", body: "Salut, tu es libre samedi soir ? On pensait essayer le nouveau restaurant près du parc. Dis-moi ce que tu en penses." },
      { from: "{name} <{first}@example.net>", subject: "Re : brouillon du plan de projet", body: "Merci de me l'avoir envoyé. Je l'ai lu deux fois et j'ai deux questions sur le calendrier. Peut-on en parler demain ? J'ai besoin de ta réponse avant le {deadline} pour réserver la salle.", hasDeadline: true },
      { from: "{name} <{first}@example.com>", subject: "Photos du week-end", body: "J'ai enfin trié les photos du voyage, je partage l'album ce soir. Tu es très bien sur celle du lac." },
    ],
    ja: [
      { from: "{name} <{first}@example.org>", subject: "土曜日の夕食どう？", body: "こんにちは、土曜の夜は空いてる？公園の近くの新しいお店に行ってみようと思ってるんだ。どうかな。" },
      { from: "{name} <{first}@example.net>", subject: "Re: プロジェクト計画の草案", body: "送ってくれてありがとう。二回読んで、スケジュールについて二つ質問があります。明日話せますか？会議室を予約するので、{deadline}までに返事をください。", hasDeadline: true },
      { from: "{name} <{first}@example.com>", subject: "週末の写真", body: "旅行の写真をやっと整理できたよ。今夜アルバムを共有するね。湖のところの写真、よく撮れてるよ。" },
    ],
  },
  records: {
    en: [
      { from: "Northwind Bank <statements@bank.example>", subject: "Your monthly statement is ready", body: "Your statement for account ending {n} is available. Please review it. Questions about a transaction must be raised before {deadline}.", hasDeadline: true },
      { from: "Harbor Insurance <policy@insurer.example>", subject: "Your policy renewal", body: "Your home insurance policy {n} renews automatically. Your updated contract is attached. Cancel before {deadline} if you do not wish to renew.", hasDeadline: true },
      { from: "City Tax Office <noreply@tax.example>", subject: "Tax return received", body: "We have received your tax return for the year. Your reference number is {n}. No further action is needed." },
    ],
    fr: [
      { from: "Banque Nordique <releves@bank.example>", subject: "Votre relevé mensuel est disponible", body: "Votre relevé du compte se terminant par {n} est disponible. Toute contestation d'opération doit nous parvenir avant le {deadline}.", hasDeadline: true },
      { from: "Assurances du Port <contrat@insurer.example>", subject: "Renouvellement de votre contrat", body: "Votre contrat d'assurance habitation {n} se renouvelle automatiquement. Le nouveau contrat est joint. Résiliez avant le {deadline} si vous ne souhaitez pas le renouveler.", hasDeadline: true },
      { from: "Service des impôts <noreply@tax.example>", subject: "Déclaration de revenus reçue", body: "Nous avons bien reçu votre déclaration de revenus. Votre numéro de référence est {n}. Aucune démarche supplémentaire n'est nécessaire." },
    ],
    ja: [
      { from: "ノースウィンド銀行 <statements@bank.example>", subject: "月次明細書のご案内", body: "口座番号末尾{n}の明細書をご確認ください。取引内容に関するお問い合わせは{deadline}までにお願いします。", hasDeadline: true },
      { from: "ハーバー保険 <policy@insurer.example>", subject: "保険契約の更新について", body: "住宅保険契約{n}は自動更新されます。新しい契約書を添付しました。更新しない場合は{deadline}までに解約してください。", hasDeadline: true },
      { from: "市税務署 <noreply@tax.example>", subject: "確定申告を受領しました", body: "確定申告書を受領しました。受付番号は{n}です。これ以上の手続きは不要です。" },
    ],
  },
  "purchases-travel": {
    en: [
      { from: "Brightshop <orders@shop.example>", subject: "Your order {n} has shipped", body: "Good news, your order {n} is on its way. Estimated delivery: {deadline}. Track your parcel with the carrier.", hasDeadline: true },
      { from: "Skyline Air <booking@air.example>", subject: "Your booking confirmation", body: "Thank you for booking. Your e-ticket for reservation {n} is attached. Online check-in closes on {deadline}.", hasDeadline: true },
      { from: "Brightshop <receipts@shop.example>", subject: "Receipt for your purchase", body: "Thanks for your purchase of {amount}. Your receipt for order {n} is below." },
    ],
    fr: [
      { from: "Boutiquéclat <commandes@shop.example>", subject: "Votre commande {n} a été expédiée", body: "Bonne nouvelle, votre commande {n} est en route. Livraison estimée : {deadline}. Suivez votre colis chez le transporteur.", hasDeadline: true },
      { from: "Ciel Air <reservation@air.example>", subject: "Confirmation de votre réservation", body: "Merci pour votre réservation. Votre billet électronique pour le dossier {n} est joint. L'enregistrement en ligne ferme le {deadline}.", hasDeadline: true },
      { from: "Boutiquéclat <recus@shop.example>", subject: "Reçu de votre achat", body: "Merci pour votre achat de {amount}. Le reçu de la commande {n} se trouve ci-dessous." },
    ],
    ja: [
      { from: "ブライトショップ <orders@shop.example>", subject: "ご注文{n}を発送しました", body: "ご注文{n}を発送いたしました。お届け予定日は{deadline}です。配送状況は運送会社のサイトでご確認ください。", hasDeadline: true },
      { from: "スカイライン航空 <booking@air.example>", subject: "ご予約確認", body: "ご予約ありがとうございます。予約番号{n}の電子航空券を添付しました。オンラインチェックインは{deadline}に締め切られます。", hasDeadline: true },
      { from: "ブライトショップ <receipts@shop.example>", subject: "ご購入の領収書", body: "{amount}のご購入ありがとうございます。注文{n}の領収書は以下のとおりです。" },
    ],
  },
  "sign-ins-security": {
    en: [
      { from: "Account Security <no-reply@accounts.example>", subject: "Your verification code", body: "Your sign-in code is {n}. It expires in 10 minutes. If you did not request it, ignore this email." },
      { from: "Account Security <no-reply@accounts.example>", subject: "New sign-in from a new device", body: "We noticed a sign-in to your account from a new device. If this was you, no action is needed. Otherwise reset your password." },
      { from: "Account Security <no-reply@accounts.example>", subject: "Reset your password", body: "We received a request to reset your password. Use the code {n} to continue. The code is valid for 15 minutes." },
    ],
    fr: [
      { from: "Sécurité du compte <no-reply@accounts.example>", subject: "Votre code de vérification", body: "Votre code de connexion est {n}. Il expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message." },
      { from: "Sécurité du compte <no-reply@accounts.example>", subject: "Nouvelle connexion depuis un nouvel appareil", body: "Nous avons détecté une connexion à votre compte depuis un nouvel appareil. Si c'était vous, aucune action n'est requise. Sinon, réinitialisez votre mot de passe." },
      { from: "Sécurité du compte <no-reply@accounts.example>", subject: "Réinitialisez votre mot de passe", body: "Nous avons reçu une demande de réinitialisation de votre mot de passe. Utilisez le code {n} pour continuer. Il est valable 15 minutes." },
    ],
    ja: [
      { from: "アカウントセキュリティ <no-reply@accounts.example>", subject: "認証コードのお知らせ", body: "ログイン用の認証コードは{n}です。10分後に無効になります。心当たりがない場合はこのメールを無視してください。" },
      { from: "アカウントセキュリティ <no-reply@accounts.example>", subject: "新しいデバイスからのログイン", body: "新しいデバイスからアカウントへのログインを検出しました。ご本人の場合は操作は不要です。そうでない場合はパスワードを再設定してください。" },
      { from: "アカウントセキュリティ <no-reply@accounts.example>", subject: "パスワードの再設定", body: "パスワード再設定のリクエストを受け付けました。コード{n}を入力して続行してください。コードは15分間有効です。" },
    ],
  },
  notifications: {
    en: [
      { from: "Tasklane <notify@tasklane.example>", subject: "{name} commented on your task", body: "{name} left a comment on 'Quarterly report': 'Looks good, one small change on page 2.' Open Tasklane to reply." },
      { from: "Circle <notify@circle.example>", subject: "{name} sent you a connection request", body: "{name} wants to connect with you. You have {n} other pending invitations." },
      { from: "Calendar <calendar@cal.example>", subject: "Reminder: Team sync tomorrow", body: "Your event 'Team sync' starts tomorrow at 10:00. {n} people have accepted." },
    ],
    fr: [
      { from: "Tasklane <notify@tasklane.example>", subject: "{name} a commenté votre tâche", body: "{name} a laissé un commentaire sur « Rapport trimestriel » : « Très bien, une petite modification en page 2. » Ouvrez Tasklane pour répondre." },
      { from: "Circle <notify@circle.example>", subject: "{name} vous a envoyé une invitation", body: "{name} souhaite entrer en contact avec vous. Vous avez {n} autres invitations en attente." },
      { from: "Agenda <calendar@cal.example>", subject: "Rappel : point d'équipe demain", body: "Votre événement « Point d'équipe » commence demain à 10 h 00. {n} personnes ont accepté." },
    ],
    ja: [
      { from: "タスクレーン <notify@tasklane.example>", subject: "{name}さんがタスクにコメントしました", body: "{name}さんが「四半期報告書」にコメントしました：「良さそうです、2ページ目を少し修正してください。」Tasklaneを開いて返信できます。" },
      { from: "サークル <notify@circle.example>", subject: "{name}さんからつながりのリクエスト", body: "{name}さんがあなたとつながりたいと考えています。他に{n}件の招待が保留中です。" },
      { from: "カレンダー <calendar@cal.example>", subject: "リマインダー：明日のチーム定例", body: "予定「チーム定例」は明日10:00に始まります。{n}人が参加を承諾しました。" },
    ],
  },
  newsletters: {
    en: [
      { from: "The Weekly Brew <hello@weeklybrew.example>", subject: "Issue #{n}: how small teams ship faster", body: "This week: three essays on shipping faster with small teams, a reading list, and an interview with a designer. Read online. You are receiving this because you subscribed. Unsubscribe anytime." },
      { from: "Garden Notes <letter@gardennotes.example>", subject: "What to plant in autumn", body: "Our autumn guide: ten bulbs to plant now, how to protect young trees, and reader photos. You subscribed to Garden Notes. Manage your preferences." },
      { from: "Science Digest <editor@scidigest.example>", subject: "This month in physics", body: "Highlights from this month: a new result on quantum sensors, an explainer on gravitational waves, and our picks for books. To stop receiving this newsletter, unsubscribe." },
    ],
    fr: [
      { from: "L'Hebdo Café <bonjour@weeklybrew.example>", subject: "Numéro {n} : comment les petites équipes livrent plus vite", body: "Cette semaine : trois essais sur la livraison rapide en petite équipe, une liste de lectures et un entretien avec une designer. Lire en ligne. Vous recevez ce message car vous êtes abonné. Désabonnez-vous à tout moment." },
      { from: "Carnets de jardin <lettre@gardennotes.example>", subject: "Que planter en automne", body: "Notre guide d'automne : dix bulbes à planter maintenant, comment protéger les jeunes arbres et les photos des lecteurs. Vous êtes abonné à Carnets de jardin. Gérer vos préférences." },
      { from: "Science Hebdo <redaction@scidigest.example>", subject: "Ce mois-ci en physique", body: "À retenir ce mois-ci : un nouveau résultat sur les capteurs quantiques, un décryptage des ondes gravitationnelles et nos livres préférés. Pour ne plus recevoir cette lettre, désabonnez-vous." },
    ],
    ja: [
      { from: "週刊ブリュー <hello@weeklybrew.example>", subject: "第{n}号：小さなチームが速く出荷する方法", body: "今週は、小さなチームで素早くリリースするための三つのエッセイ、読書リスト、デザイナーへのインタビューをお届けします。ブラウザで読む。購読登録によりお送りしています。配信停止はいつでも可能です。" },
      { from: "ガーデンノート <letter@gardennotes.example>", subject: "秋に植えるもの", body: "秋のガイド：今植える球根10種、若木の守り方、読者の写真。ガーデンノートを購読中です。配信設定を管理する。" },
      { from: "サイエンスダイジェスト <editor@scidigest.example>", subject: "今月の物理学", body: "今月のハイライト：量子センサーの新しい成果、重力波の解説、おすすめの本。このニュースレターの受信を停止するには配信停止してください。" },
    ],
  },
  promotions: {
    en: [
      { from: "Brightshop <deals@shop.example>", subject: "Flash sale: up to {n}% off", body: "Our biggest sale of the season is here. Up to {n}% off everything. Offer ends {deadline}. Shop now before it is gone.", hasDeadline: true },
      { from: "Skyline Air <offers@air.example>", subject: "Fly for less this winter", body: "Fares from {amount} to sunny destinations. Book by {deadline} and save. Terms apply.", hasDeadline: true },
      { from: "FitClub <hello@fitclub.example>", subject: "We miss you! Come back for 50% off", body: "It has been a while. Rejoin FitClub today and get half off your first three months. Limited time only." },
    ],
    fr: [
      { from: "Boutiquéclat <promo@shop.example>", subject: "Vente flash : jusqu'à -{n} %", body: "La plus grande vente de la saison est là. Jusqu'à -{n} % sur tout le site. L'offre se termine le {deadline}. Profitez-en vite.", hasDeadline: true },
      { from: "Ciel Air <offres@air.example>", subject: "Voyagez moins cher cet hiver", body: "Billets à partir de {amount} vers des destinations ensoleillées. Réservez avant le {deadline} et économisez. Conditions applicables.", hasDeadline: true },
      { from: "FitClub <bonjour@fitclub.example>", subject: "Vous nous manquez ! -50 % pour revenir", body: "Cela fait un moment. Réinscrivez-vous à FitClub aujourd'hui et obtenez la moitié de réduction sur vos trois premiers mois. Offre limitée." },
    ],
    ja: [
      { from: "ブライトショップ <deals@shop.example>", subject: "フラッシュセール：最大{n}％オフ", body: "今シーズン最大のセールが始まりました。全品最大{n}％オフ。{deadline}まで。なくなる前に今すぐお買い物を。", hasDeadline: true },
      { from: "スカイライン航空 <offers@air.example>", subject: "この冬はお得に旅行", body: "暖かい行き先への運賃は{amount}から。{deadline}までにご予約でお得に。条件あり。", hasDeadline: true },
      { from: "フィットクラブ <hello@fitclub.example>", subject: "お久しぶりです！復帰で50％オフ", body: "しばらくご利用がありません。今日再入会すると最初の3か月が半額になります。期間限定。" },
    ],
  },
};

const names = ["Alex Martin", "Sam Dupont", "Yuki Tanaka", "Robin Lefèvre", "Jordan Smith", "Haruka Sato", "Camille Bernard", "Taylor Brown", "Mika Suzuki", "Noa Petit"];
const months: Record<Language, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  ja: [],
};

function formatDate(language: Language, month: number, day: number): string {
  if (language === "ja") return `${month + 1}月${day}日`;
  if (language === "fr") return `${day === 1 ? "1er" : day} ${months.fr[month]}`;
  return `${months.en[month]} ${day}`;
}

/** 10 emails per (category × language) = 210 emails; fully deterministic. */
export function buildDataset(perCell = 10, year = 2027): SyntheticEmail[] {
  const emails: SyntheticEmail[] = [];
  for (const category of categories) {
    for (const language of languages) {
      const pool = templates[category][language];
      for (let i = 0; i < perCell; i++) {
        const template = pool[i % pool.length] as Template;
        const seq = emails.length;
        const name = names[(seq * 7 + i) % names.length] as string;
        const month = (seq * 5 + i) % 12;
        const day = 1 + ((seq * 11 + i * 3) % 28);
        const fill = (text: string): string =>
          text
            .replaceAll("{name}", name)
            .replaceAll("{first}", (name.split(" ")[0] ?? "friend").normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase() || "friend")
            .replaceAll("{n}", String(2000 + ((seq * 37 + i * 13) % 7000)))
            .replaceAll("{amount}", `${20 + ((seq * 17) % 180)}.00 EUR`)
            .replaceAll("{deadline}", formatDate(language, month, day));
        emails.push({
          id: `${category}-${language}-${String(i).padStart(2, "0")}`,
          language,
          category,
          from: fill(template.from),
          subject: fill(template.subject),
          snippet: fill(template.body),
          deadline: template.hasDeadline ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null,
        });
      }
    }
  }
  return emails;
}
