# 上場イベント監視ガイド

## 目的

銘柄そのものだけでなく、上場予定・上場日・初回決算・ロックアップ解除を見逃さない。

これは買い推奨ではなく、以下を学習するための監視。

- 上場前の期待形成
- 上場日の初値・出来高・需給
- 初回決算でストーリーが数字に接続したか
- ロックアップ解除前後の売り圧力
- 上場後30日/90日の価格帯とTOPIX比
- キオクシア型のような大型IPO + 市況 + テーマ波及パターン
- SpaceX / Anthropic / OpenAI 型の非上場巨人IPO観測パターン

## 重要な考え方

上場日は、決算日と同じくらい重要。

ただし、上場日が重要という意味は「買う日」ではない。

正しくは、以下を記録する日。

```text
公開価格
初値
初日出来高
売買代金
初値後の高値/安値
公開価格比
初値比
TOPIX比
初回決算日
ロックアップ解除条件
```

## 実行コマンド

上場イベント監視だけ:

```bash
bash scripts/listing-event-watch.sh
```

上場イベント通知候補だけ:

```bash
bash scripts/listing-event-alerts.sh
```

IPO/上場/必須監視テーマをまとめて確認:

```bash
bash scripts/ipo-listing-watch-all.sh
```

## 生成ファイル

```text
reports/listing_event_watch_latest.md
reports/listing_event_watch_latest.json
reports/listing_event_alerts_latest.md
reports/listing_event_alerts_latest.json
reports/ipo_theme_watch_latest.md
reports/ipo_theme_watch_latest.json
reports/must_watch_audit_latest.md
reports/must_watch_audit_latest.json
```

## listing_event_alerts の見方

### priority

以下は priority 扱い。

```text
上場日が7日以内
初回決算が14日以内
ロックアップ解除が30日以内
```

priority は買い指示ではない。

意味は、見逃すとパターン学習の起点を失う重要イベント。

### backfill needed

日付が未登録のイベントは backfill needed に出る。

例:

```text
キオクシアの上場日/公開価格/初値/初回決算/ロックアップ解除条件
SpaceX / Anthropic / OpenAI の上場予定日/S-1/想定時価総額/ロックアップ条件
```

これは、過去イベントでも後から埋めて学習対象にするため。

## キオクシア型で見ること

```text
大型IPO
メモリ市況
AIインフラ波及
NAND/SSD/eSSD需要
IPO後需給
初回決算
ロックアップ解除
```

問い:

```text
IPO後の売り圧は残っているか
NAND/SSD/eSSD需要にAI投資が接続しているか
GPU/HBM側だけで終わっていないか
メモリ市況は改善しているか
公開価格/初値/現在値のどこにいるか
```

## SpaceX / Anthropic / OpenAI 型で見ること

```text
上場観測
S-1/公式上場申請
想定時価総額
売出比率
初回決算
ロックアップ解除
日本株への波及
```

問い:

```text
これは実需拡大か、既存株主の出口イベントか
関連銘柄は既に織り込み済みか
上場日/初回決算/ロックアップ解除のどのフェーズか
本命が高すぎる場合、周辺受益に合理性があるか
```

## data/listing_events.jsonl の例

手動で上場イベントを追加する場合の例。

```json
{"id":"example-listing","code":"0000","name":"サンプルIPO","eventType":"listing_day","eventDate":"2026-07-01","source":"manual","notificationLevel":"priority","status":"watch","whyWatch":"上場日・初値・出来高を記録するため","evidenceToBackfill":["公開価格","初値","初日出来高","初回決算日","ロックアップ解除条件"]}
```

日付形式は `YYYY-MM-DD`。

## 安全ルール

- 上場予定は買い指示ではない
- 上場週は原則観察フェーズ
- 初回決算前は数字未確認
- ロックアップ解除は売り圧力確認を優先
- テーマ性だけで調査候補を上げない
- 同じパターンを学ぶため、見逃した上場イベントも retrospect で登録する

## 次の改善候補

- JPX新規上場情報から自動取得
- 初回決算予定日の自動推定
- ロックアップ解除日の自動抽出
- listing_event_alerts を LINE/Slack 通知へ接続
- 上場後30日/90日のTOPIX比レビュー
