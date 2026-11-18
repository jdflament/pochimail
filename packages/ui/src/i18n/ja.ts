import { type Catalog, entry } from "./messages.ts";

/**
 * Japanese catalog. Polite です・ます register, natural product Japanese, no machine-literal
 * phrasing. "Pochimail" and "Pochi" stay untranslated. Typed against the English keys.
 */
export const ja = {
  "overview.title": entry("概要", []),
  "overview.privacy": entry("すべてこの端末の中に留まります。どこにも送信されません。", []),
  "overview.promise.device": entry("メールがこの{device}の外に出ることはありません。", ["device"]),
  "overview.sorting": entry("この{device}の中だけで整理しています。", ["device"]),
  "overview.worker.connecting": entry("バックグラウンドの準備をしています…", []),
  "overview.worker.ready": entry("バックグラウンドの準備ができました。", []),
  "overview.worker.unavailable": entry("バックグラウンドで問題が起きています。", []),
  "overview.email.count": entry("{count, plural, =0 {メールはありません} other {#件のメール}}", [
    "count",
  ]),
  "overview.size.free": entry("合計{total, number} GBのうち、{size, number} GBを空けられます。", [
    "size",
    "total",
  ]),
  "scan.failed": entry(
    "仕分けを最後まで終えられませんでした。何も変更していません。もう一度始めると、止まったところから続けます。",
    [],
  ),
  "overview.review": entry("確認する", []),
  "overview.pause": entry("一時停止", []),
  "overview.resume": entry("再開", []),
  "overview.viewSummary": entry("まとめを見る", []),
  "overview.catch.title": entry("大切なこと", []),
  "overview.clean.title": entry("整理", []),
  "summary.from": entry("Pochiより · {date, date, long} · この{device}で", ["date", "device"]),

  "shell.loading": entry("起動しています…", []),
  "shell.error.title": entry("問題が発生しました", []),
  "shell.error.body": entry(
    "Pochimailで問題が発生しました。アプリを閉じてもう一度開いてください。",
    [],
  ),

  "welcome.headline": entry("メールを整理して、大切なものを残しましょう。", []),
  "welcome.description": entry(
    "Pochimailは、今お使いのメールアカウントのためのプライベートなアシスタントです。対応が必要なメールを見つけ、不要なメールを片付け、書類を保存します。メールがこの{device}の外に出ることはありません。",
    ["device"],
  ),
  "welcome.cta": entry("始める", []),
  "welcome.openSource": entry("無料のオープンソース", []),
  "onboarding.progress": entry("ステップ{current}／{total}", ["current", "total"]),

  "connect.title": entry("接続", []),
  "connect.description": entry("始めるにはメールアカウントを接続してください。", []),

  "setup.title": entry("設定", []),
  "setup.description": entry("Pochiにどのように手伝ってほしいか選んでください。", []),
  "setup.bubble": entry(
    "こんにちは、Pochiです。手伝ってほしいことと、どこまで任せるかを教えてください。設定でいつでも変更できます。",
    [],
  ),
  "setup.capabilities.heading": entry("何をお手伝いしましょうか？", []),
  "setup.capabilities.hint": entry("複数選べます", []),
  "setup.capability.catch-what-matters.title": entry("大事なメールを見つける", []),
  "setup.capability.catch-what-matters.description": entry(
    "返信を待っている人、期限、重要な送信者をお知らせします。",
    [],
  ),
  "setup.capability.declutter.title": entry("整理して減らす", []),
  "setup.capability.declutter.description": entry(
    "不要なメールの配信停止とアーカイブを行います。",
    [],
  ),
  "setup.capability.organize.title": entry("分類する", []),
  "setup.capability.organize.description": entry(
    "メールをカテゴリやトピックに分けて、ラベルとして付けます。",
    [],
  ),
  "setup.capability.save-documents.title": entry("書類を保存する", []),
  "setup.capability.save-documents.description": entry(
    "大切な添付ファイルを見つけて、フォルダーに保存します。",
    [],
  ),
  "setup.autonomy.heading": entry("どこまで任せますか？", []),
  "setup.autonomy.recommended": entry("おすすめ", []),
  "setup.autonomy.just-look.title": entry("見るだけ", []),
  "setup.autonomy.just-look.description": entry("内容をお見せしますが、何も変更しません。", []),
  "setup.autonomy.suggest.title": entry("提案する", []),
  "setup.autonomy.suggest.description": entry("私が準備し、各ステップはあなたが承認します。", []),
  "setup.autonomy.autopilot.title": entry("オートパイロット", []),
  "setup.autonomy.autopilot.description": entry("明らかなものは私が処理し、あとで報告します。", []),
  "setup.autonomy.autopilot.reminder": entry(
    "オートパイロットでは、{percent}％以上確実なときだけアーカイブや配信停止を行い、個人からのメールには一切触れません。行った内容は報告され、元に戻せます。ただし配信停止は元に戻せません。",
    ["percent"],
  ),
  "setup.invariants": entry(
    "どのモードでも、何も削除せず、個人からのメールは確認なしに操作せず、すべて元に戻せます。",
    [],
  ),
  "setup.start": entry("整理を始める", []),
  "setup.error": entry("整理を開始できませんでした。もう一度お試しください。", []),

  "documents.title": entry("ドキュメント", []),
  "documents.description": entry("保存したドキュメントがここに表示されます。", []),

  "activity.title": entry("アクティビティ", []),
  "activity.description": entry("最近の操作と取り消し履歴がここに表示されます。", []),

  "settings.title": entry("設定", []),
  "settings.description": entry("環境設定とアカウント設定がここに表示されます。", []),

  "nav.brand": entry("Pochimail", []),
  "nav.label": entry("メインナビゲーション", []),
  "nav.email": entry("メール", []),
  "nav.tools": entry("ツール", []),
  "nav.teams": entry("チーム", []),
  "nav.soon": entry("近日公開", []),
  "switcher.menu": entry("アカウント", []),
  "switcher.all": entry("すべてのアカウント", []),
  "switcher.add": entry("別のアカウントを追加", []),
  "category.people": entry("人", []),
  "category.records": entry("記録", []),
  "category.purchasesTravel": entry("購入・旅行", []),
  "category.signInsSecurity": entry("サインイン・セキュリティ", []),
  "category.notifications": entry("通知", []),
  "category.newsletters": entry("ニュースレター", []),
  "category.promotions": entry("プロモーション", []),
  "category.placeholder": entry("このカテゴリのメールがここに表示されます。", []),

  "devGallery.title": entry("開発ギャラリー", []),
  "devGallery.description": entry("開発用の状態とモーションのプレビューです。", []),
  "action.close": entry("閉じる", []),
  "action.undo": entry("元に戻す", []),
  "storageBar.description": entry("{summary}：{items}", ["summary", "items"]),
  "storageBar.descriptionItem": entry("{label} {size}", ["size", "label"]),
  "storageBar.itemSeparator": entry("、", []),
  "storageBar.legendItem": entry("{label} · {size}", ["label", "size"]),
} satisfies Catalog;
