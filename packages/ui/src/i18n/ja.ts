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
  "overview.review": entry("確認する", []),
  "overview.pause": entry("一時停止", []),
  "overview.resume": entry("再開", []),
  "overview.viewSummary": entry("まとめを見る", []),
  "overview.catch.title": entry("大切なこと", []),
  "overview.clean.title": entry("整理", []),
  "summary.from": entry("Pochiより · {date, date, long} · この{device}で", ["date", "device"]),
} satisfies Catalog;
