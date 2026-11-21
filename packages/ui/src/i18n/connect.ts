import { entry } from "./entry.ts";

/** Connect screen copy, one object per language, spread into each catalog. */
export const connectEn = {
  "connect.title": entry("Connect an email account", []),
  "connect.description": entry(
    "Sign in with your provider. Pochimail never sees your password, and you can add more accounts later.",
    [],
  ),
  "connect.google": entry("Continue with Google", []),
  "connect.microsoft": entry("Continue with Microsoft", []),
  "connect.promises": entry("My promises", []),
  "connect.promise.local.title": entry("Your email stays on this {device}", ["device"]),
  "connect.promise.local.body": entry(
    "Everything is analyzed locally. No server, no cloud AI.",
    [],
  ),
  "connect.promise.control.title": entry("You decide what I can do", []),
  "connect.promise.control.body": entry(
    "Next, you choose whether I only look, suggest, or act on my own.",
    [],
  ),
  "connect.promise.delete.title": entry("Nothing is deleted without your OK", []),
  "connect.promise.delete.body": entry("Deleted emails go to the Trash, and you can undo.", []),
} as const;

export const connectFr = {
  "connect.title": entry("Connecter un compte email", []),
  "connect.description": entry(
    "Connectez-vous auprès de votre fournisseur. Pochimail ne voit jamais votre mot de passe, et vous pourrez ajouter d’autres comptes plus tard.",
    [],
  ),
  "connect.google": entry("Continuer avec Google", []),
  "connect.microsoft": entry("Continuer avec Microsoft", []),
  "connect.promises": entry("Mes promesses", []),
  "connect.promise.local.title": entry("Vos emails restent sur votre {device}", ["device"]),
  "connect.promise.local.body": entry(
    "Tout est analysé localement. Aucun serveur, aucune IA dans le cloud.",
    [],
  ),
  "connect.promise.control.title": entry("Vous décidez de ce que je peux faire", []),
  "connect.promise.control.body": entry(
    "Ensuite, vous choisissez si je regarde seulement, si je propose ou si j’agis seul.",
    [],
  ),
  "connect.promise.delete.title": entry("Rien n’est supprimé sans votre accord", []),
  "connect.promise.delete.body": entry(
    "Les emails supprimés vont dans la corbeille, et vous pouvez annuler.",
    [],
  ),
} as const;

export const connectJa = {
  "connect.title": entry("メールアカウントを接続", []),
  "connect.description": entry(
    "プロバイダーでサインインします。Pochimailがパスワードを見ることはなく、アカウントは後から追加できます。",
    [],
  ),
  "connect.google": entry("Googleで続ける", []),
  "connect.microsoft": entry("Microsoftで続ける", []),
  "connect.promises": entry("私の約束", []),
  "connect.promise.local.title": entry("メールはこの{device}の外に出ません", ["device"]),
  "connect.promise.local.body": entry(
    "すべてこの端末内で分析します。サーバーもクラウドAIも使いません。",
    [],
  ),
  "connect.promise.control.title": entry("私にできることはあなたが決めます", []),
  "connect.promise.control.body": entry(
    "次に、見るだけか、提案するか、自分で行動するかを選びます。",
    [],
  ),
  "connect.promise.delete.title": entry("あなたの了承なしに削除しません", []),
  "connect.promise.delete.body": entry("削除したメールはゴミ箱に移り、元に戻せます。", []),
} as const;
