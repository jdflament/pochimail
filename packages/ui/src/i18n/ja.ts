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
  "summary.title": entry("不在の間のできごと", []),
  "summary.sentence": entry("新しいメール{count}件を仕分けしました。削除したものはありません。", [
    "count",
  ]),
  "summary.figure.sorted": entry("仕分け済み", []),
  "summary.figure.review": entry("確認待ち", []),
  "summary.figure.free": entry("解放できる容量", []),
  "summary.tidy": entry("整理を続ける", []),
  "summary.tidy.weekly": entry("毎週", []),
  "summary.tidy.daily": entry("毎日", []),
  "summary.later": entry("あとで", []),
  "summary.reviewCount": entry("メール{count}件を確認する", ["count"]),

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
  "state.signInCancelled.title": entry("サインインをキャンセルしました", []),
  "state.signInCancelled.body": entry(
    "大丈夫です。何にもアクセスしていません。準備ができたら、いつでもやり直せます。",
    [],
  ),
  "state.signInCancelled.retry": entry("もう一度試す", []),
  "state.signInCancelled.other": entry("別のアカウントを選ぶ", []),
  "state.offline.title": entry("オフラインです", []),
  "state.offline.body": entry(
    "いつも通りお使いください。オンラインに戻ったら、すぐに同期して承認済みの内容を反映します。",
    [],
  ),
  "state.offline.dismiss": entry("OK", []),
  "state.reconnect.title": entry("{provider}アカウントにアクセスできなくなりました", ["provider"]),
  "state.reconnect.body": entry(
    "{provider}から再度サインインを求められています。整理の状況と設定は安全です。",
    ["provider"],
  ),
  "state.reconnect.action": entry("再接続", []),
  "state.reconnect.remove": entry("アカウントを削除", []),
  "state.modelFailed.title": entry("アシスタントのモデルをダウンロードできませんでした", []),
  "state.modelFailed.body": entry(
    "再試行する間も、簡単なルールで整理を続けられます。結果の精度は少し下がります。",
    [],
  ),
  "state.modelFailed.retry": entry("ダウンロードを再試行", []),
  "state.modelFailed.rules": entry("ルールで続ける", []),
  "state.rateLimit.title": entry("{provider}の制限で処理が遅くなっています", ["provider"]),
  "state.rateLimit.body": entry(
    "大きなメールボックスは{provider}の制限に達します。{minutes, plural, other {#分}}後に自動で再開します。",
    ["provider", "minutes"],
  ),
  "state.rateLimit.dismiss": entry("OK", []),
  "state.emptyCategory.title": entry("ここに整理するものはありません", []),
  "state.emptyCategory.body": entry(
    "このカテゴリはすでにきれいです。変わったらお知らせします。",
    [],
  ),
  "state.emptyCategory.action": entry("概要に戻る", []),
  "state.nothingToDo.title": entry("することはありません", []),
  "state.nothingToDo.body": entry(
    "すべて整理済みで、お返事を待っている人もいません。変わったらお知らせします。",
    [],
  ),
  "state.nothingToDo.action": entry("概要に戻る", []),
  "state.updateReady.title": entry("新しいバージョンの準備ができました", []),
  "state.updateReady.body": entry(
    "Pochimail {version}の準備ができました。再起動するとインストールされ、メールはそのままです。",
    ["version"],
  ),
  "state.updateReady.restart": entry("今すぐ再起動", []),
  "state.updateReady.whatsNew": entry("新機能", []),
} satisfies Catalog;
