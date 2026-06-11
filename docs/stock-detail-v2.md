# 銘柄詳細ページ v2

## 目的

`/stocks/[code]` は、銘柄を強く評価するための画面ではなく、調査候補の考察履歴を残すための画面です。

以下を 1 ページで追えるようにします。

- なぜ調査候補になったか
- どんな仮説だったか
- 反証条件は何か
- 1d / 1w / 1m / 3m の答え合わせがどう扱われたか
- 外れ理由、未評価、データ不足、価格データ提供待ちをどう表示するか
- 次に何を確認すべきか

## 読み方

このページは投資助言ではありません。表示されるスコアやラベルは、調査・検証の優先度を整理するための補助情報です。

### outcome

outcome は、過去に立てた仮説を horizon ごとに確認する記録です。`1d`、`1w`、`1m`、`3m` が存在する場合だけ表示されます。

`dataAvailability` が `ok` ではない場合、結果は未評価として扱います。方向が `unknown` 同士の記録も、仮説と整合した扱いにはしません。

### 未評価

`result = null`、`result = unknown`、または十分な価格データがない記録は未評価です。未評価は悪い結果ではなく、まだ検証できない状態として表示します。

### 価格データ不足 / priceDataPending

J-Quants の遅延などで価格データがまだ提供されていない場合は、`priceDataPending` を info 扱いにします。ops health の attention に戻さず、価格データ提供後の再確認ポイントとして表示します。

### 反証条件

反証条件は、仮説を閉じる・見直すための確認項目です。`invalidationSignals`、特殊状況 watch の `whyNotNow`、company memory の既知リスクなどから、表示可能な範囲で合成します。

### 外れ理由・学習メモ

`missedSignals`、`notes`、`improvedRuleIdeas`、company memory の recurring warnings を、次回改善ログとして表示します。反省メモが空の場合は「未記録」と表示します。

## 現時点で使うデータ

- `apps/web/public/generated/alpha-pon-data.json`
- `apps/web/public/generated/ops-dashboard.json`
- `reports/outcome-quality-audit.json`

生成済み JSON の既存フィールドを破壊的に変更せず、`apps/web/lib/stock-detail.ts` の loader で詳細表示用に合成します。

## 現時点で出せない情報

- 一次情報本文の全文比較
- 銘柄ごとのニュース時系列の完全な履歴
- 未生成ファイルにしか存在しない手動メモ
- 価格データ提供予定日の銘柄別精密計算

これらは将来、optional な detail summary として追加できます。
