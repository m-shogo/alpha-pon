# IPO / 上場イベント ローカル検証チェックリスト

## 目的

advanced一括スクリプトを実データで動かした後、どこを確認すべきかを固定する。

これは買い推奨ではなく、上場イベント監視・通知・レビューの品質確認。

## 実行

```bash
cd /Users/m-shogo/Developer/personal/alpha-pon
bash scripts/ipo-listing-watch-advanced.sh
```

その後:

```bash
pnpm check
pnpm verify:pro:local
pnpm health
pnpm backup
```

## 1. readiness

見るファイル:

```text
reports/listing_automation_readiness_latest.md
```

確認:

- `JPX_LISTINGS_URL` が missing ならJPX取得は未接続
- `data/listing_events.jsonl` が missing ならイベントDB未作成
- `data/listing_review_prices.csv` が missing なら価格レビュー未接続
- `data/prospectus_text.txt` が missing ならロックアップ抽出未接続
- LINE/Slack が warning でも dry-run は可能

## 2. JPX取得

見るファイル:

```text
reports/jpx_listing_sync_latest.md
```

確認:

- `parsed` が0ならURL/形式を確認
- `appendable` がある場合、内容を見てから `--write`
- 会社名/コード/上場日が誤っていないか見る
- parser が `regex_fallback` ばかりなら精度注意

## 3. 上場イベントDB

見るファイル:

```text
reports/listing_event_sync_preview_latest.md
reports/listing_event_alerts_latest.md
```

確認:

- `backfill required` が残っている銘柄
- `priority` が多すぎないか
- 上場日/初回決算/ロックアップ解除が重複していないか

## 4. 初回決算推定

見るファイル:

```text
reports/first_earnings_estimate_latest.md
```

確認:

- `confidence=low` になっているか
- 公式日程未確認のものをpriority扱いしていないか
- 推定日はあとでIRカレンダー/決算発表予定で確認する

## 5. ロックアップ

見るファイル:

```text
reports/prospectus_lockup_extract_latest.md
reports/lockup_event_extract_latest.md
```

確認:

- `180日` / `90日` / `発行価格1.5倍` などが正しく拾えているか
- 目論見書の表崩れで誤読していないか
- `lockupExpiryDate` が未登録なら手動確認する

## 6. 通知

見るファイル:

```text
reports/listing_event_alert_sender_policy_latest.md
```

確認:

- priority件数が多すぎないか
- backfill needed が多すぎないか
- safetyFooter が入っているか
- 買い指示に見える文言がないか

## 7. J-Quants価格

見るファイル:

```text
reports/jquants_listing_review_prices_latest.md
reports/listing_review_price_import_latest.md
```

確認:

- JQUANTS_EMAIL / JQUANTS_PASSWORD が未設定なら setup needed
- reviewPrice が missing の銘柄
- 30d/90d の日付が営業日でない場合の欠損
- `--write-csv` は内容確認後に実行

## 8. TOPIX相対

見るファイル:

```text
reports/listing_topix_relative_latest.md
```

確認:

- `data/listing_topix.csv` が必要
- listingTopix / reviewTopix が正しいか
- topixRelativeReturn が missing の行
- 0埋めされていないか

## 9. 上場後レビュー

見るファイル:

```text
reports/listing_performance_review_latest.md
reports/listing_event_review_latest.md
```

確認:

- publicPriceReturn
- initialPriceReturn
- topixRelativeReturn
- dataQuality
- missingFields

## 10. 最後に見るべき結論

良い状態:

```text
readiness: missingが少ない
JPX parsed > 0
priorityが適量
backfill requiredが減っている
reviewPriceが入っている
topixRelativeReturnが入っている
買い指示文言なし
```

危ない状態:

```text
JPX parsed=0
regex_fallbackばかり
priorityが大量
backfillが放置
reviewPrice missingだらけ
topixRelativeReturn missingだらけ
通知文が強すぎる
```

## 安全ルール

- `--write` はpreview確認後
- `--send` はmessage確認後
- 価格欠損を0で埋めない
- PDF抽出結果は必ず原文確認
- 上場イベントは買う日ではなく、記録と検証の日
