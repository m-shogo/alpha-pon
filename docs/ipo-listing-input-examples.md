# IPO / 上場イベント 入力例ガイド

## 目的

実データ投入時の形式ミスを減らす。

この仕組みは買い推奨ではなく、上場イベント・ロックアップ・価格レビューを記録するためのもの。

## 価格/TOPIX CSV

サンプル:

```text
examples/listing_review_prices.example.csv
```

実運用では以下へコピーして使う。

```bash
cp examples/listing_review_prices.example.csv data/listing_review_prices.csv
```

形式:

```csv
code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn
285A,1455,1440,1800,0.12
```

取り込みpreview:

```bash
node --import tsx/esm src/update-listing-review-prices.ts
```

反映:

```bash
node --import tsx/esm src/update-listing-review-prices.ts --write
```

## ロックアップメモJSONL

サンプル:

```text
examples/lockup_memos.example.jsonl
```

実運用では以下へコピーして使う。

```bash
cp examples/lockup_memos.example.jsonl data/lockup_memos.jsonl
```

形式:

```json
{"id":"example-lockup","code":"0000","name":"サンプルIPO","listingDate":"2026-07-01","lockupDays":180,"source":"manual","memo":"主要株主180日ロックアップ。解除条件は目論見書で手動確認済み。"}
```

イベント化preview:

```bash
node --import tsx/esm src/extract-lockup-events.ts
```

反映:

```bash
node --import tsx/esm src/extract-lockup-events.ts --write
```

## 目論見書テキスト

サンプル:

```text
examples/prospectus_text.example.txt
```

実運用では以下へコピーして、実際の目論見書テキストに置き換える。

```bash
cp examples/prospectus_text.example.txt data/prospectus_text.txt
```

候補抽出preview:

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts
```

候補を `data/lockup_memos.jsonl` に追記:

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts --write
```

## 通知ポリシー

設定:

```text
config/listing-notification-policy.yml
```

見る項目:

```text
maxPriorityItems
maxBackfillItems
includeMorningSummary
includeBackfillNeeded
includeLogLevel
suppressWhenNoPriority
```

ポリシー対応senderのpreview:

```bash
node --import tsx/esm src/listing-event-alert-sender-policy.ts
```

実送信:

```bash
node --import tsx/esm src/listing-event-alert-sender-policy.ts --send
```

実送信に必要な環境変数:

```text
LINE_CHANNEL_TOKEN
LINE_USER_ID
SLACK_WEBHOOK_URL
```

## 安全ルール

- `--write` なしではデータへ反映しない
- `--send` なしでは外部送信しない
- 価格がない場合は `0` ではなく空欄/未設定にする
- ロックアップ抽出は候補であり、必ず目論見書で確認する
- 上場日・初回決算・ロックアップ解除は買う日ではなく、記録と検証の日
