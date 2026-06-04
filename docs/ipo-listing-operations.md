# IPO / 上場イベント運用ガイド

## 目的

上場予定・上場日・初回決算・ロックアップ解除・上場後30日/90日レビューを見逃さないための運用手順。

これは買い推奨ではなく、調査・記録・パターン学習のための仕組み。

## 標準実行

基本は readiness 付きの一括スクリプトを使う。

```bash
bash scripts/ipo-listing-watch-all-with-readiness.sh
```

このスクリプトは最初に以下を確認する。

- `JPX_LISTINGS_URL`
- `data/listing_events.jsonl`
- `data/listing_review_prices.csv`
- `data/prospectus_text.txt`
- `LINE_CHANNEL_TOKEN` / `LINE_USER_ID`
- `SLACK_WEBHOOK_URL`

不足がある場合は、`reports/listing_automation_readiness_latest.md` に出る。

## 生成レポート

```text
reports/listing_automation_readiness_latest.md
reports/ipo_theme_watch_latest.md
reports/jpx_listing_sync_latest.md
reports/listing_event_watch_latest.md
reports/listing_event_sync_preview_latest.md
reports/first_earnings_estimate_latest.md
reports/prospectus_lockup_extract_latest.md
reports/lockup_event_extract_latest.md
reports/listing_event_alerts_latest.md
reports/listing_event_message_preview_latest.md
reports/listing_event_alert_sender_latest.md
reports/listing_review_price_import_latest.md
reports/listing_event_review_latest.md
reports/listing_performance_review_latest.md
reports/must_watch_audit_latest.md
```

## JPX新規上場情報

環境変数を設定する。

```bash
export JPX_LISTINGS_URL="JPX新規上場情報のURL"
```

まずはdry-run。

```bash
node --import tsx/esm src/sync-jpx-listings.ts
```

問題なければ、明示的に `--write`。

```bash
node --import tsx/esm src/sync-jpx-listings.ts --write
```

`--write` なしでは `data/listing_events.jsonl` に追記しない。

## 初回決算推定

上場日から初回決算候補を推定する。

```bash
node --import tsx/esm src/estimate-first-earnings.ts
```

反映する場合だけ `--write`。

```bash
node --import tsx/esm src/estimate-first-earnings.ts --write
```

推定日は公式日程ではないため、`estimated=true` / `confidence=low` として扱う。

## ロックアップ解除

### テキスト抽出

目論見書PDFは、まずテキスト化して `data/prospectus_text.txt` に置く。

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts
```

候補を `data/lockup_memos.jsonl` に追記する場合だけ `--write`。

```bash
node --import tsx/esm src/extract-lockup-from-prospectus.ts --write
```

### イベント化

```bash
node --import tsx/esm src/extract-lockup-events.ts
```

反映する場合だけ `--write`。

```bash
node --import tsx/esm src/extract-lockup-events.ts --write
```

## 通知

まずはdry-run。

```bash
node --import tsx/esm src/listing-event-alert-sender.ts
```

実送信は環境変数を確認してから、明示的に `--send`。

```bash
node --import tsx/esm src/listing-event-alert-sender.ts --send
```

使う環境変数:

```text
LINE_CHANNEL_TOKEN
LINE_USER_ID
SLACK_WEBHOOK_URL
```

## 価格/TOPIXレビュー

J-QuantsやTOPIXデータを使って、まずCSVを用意する。

```csv
code,publicPrice,initialPrice,reviewPrice,topixRelativeReturn
285A,1455,1440,1800,0.12
```

既定パス:

```text
data/listing_review_prices.csv
```

preview:

```bash
node --import tsx/esm src/update-listing-review-prices.ts
```

反映:

```bash
node --import tsx/esm src/update-listing-review-prices.ts --write
```

その後にレビュー。

```bash
node --import tsx/esm src/review-listing-performance.ts
```

## 安全ルール

- 買い推奨ではない
- 上場日は買う日ではなく、記録する日
- `--write` なしではデータ追記しない
- `--send` なしでは外部送信しない
- 価格やTOPIX比がない場合、0埋めしない
- 目論見書抽出は候補であり、手動確認が必要
- JPXパーサは実URLで必ずdry-run確認する

## 帰宅後の推奨コマンド

```bash
cd /Users/m-shogo/Developer/personal/alpha-pon

bash scripts/ipo-listing-watch-all-with-readiness.sh
pnpm check
pnpm verify:pro:local
pnpm health
pnpm backup
```

## まだ残る本番精度タスク

- JPX実URLでのパーサ精度確認
- J-Quants APIから直接 reviewPrice を埋める
- TOPIX実データから topixRelativeReturn を自動計算する
- PDFバイナリから直接テキスト抽出する
- 通知のノイズ量を調整する
