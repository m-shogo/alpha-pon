# 世界ニュース影響仮説レビュー（World Impact Intelligence v2）

世界ニュースを「ニュース → 影響メカニズム → 業界/テーマ → 銘柄 → 検証可能な仮説 → 後日レビュー → 学習メモ」
の一気通貫で保存・検証するための運用メモです。
この機能は投資助言ではなく、一次情報・価格データ・反証条件をそろえるための研究ログです。

## v2 で各レビューが持つ検証可能仮説フィールド

| フィールド | 内容 |
|---|---|
| `mechanisms` | 影響メカニズム分類（demand/supply/cost/fx/rates/regulation/energy/defense/semiconductor/consumer/travel/logistics/ip_brand/geopolitical/climate_disaster/unknown） |
| `impactPath` | ニュース → メカニズム → テーマ → 銘柄 の二段階影響経路 |
| `direction` | positive / negative / mixed / unclear（検証前は unclear 起点） |
| `confidence` | 0〜1。初期値は情報源の信頼度由来（official=0.6 〜 unknown=0.3、上限0.6） |
| `expectedLagDays` | 想定タイムラグ（1/7/30 日） |
| `thesis` | なぜ影響すると思ったか |
| `falsification` | 何が起きたらこの仮説は外れと見なすか |
| `watchSignals` | 後で見るべき確認シグナル |
| `riskFactors` | 外れる要因 |
| `reviewDueAt` / `reviewStatus` | レビュー期限と状態（pending / reviewed / skipped / insufficient_data） |
| `outcomes[].result` | hit / miss / inverse / too_early / unclear / insufficient_data / 未評価(null) |
| `outcomes[].missReason` | 外れ理由分類（already_priced_in / weak_linkage / macro_overpowered / wrong_lag / wrong_direction / company_specific_offset / data_insufficient / unclear） |
| `lesson` | 次回に活かす学習メモ |

v1 レコードは `pnpm backfill:world-impact` が破壊的変更なしに補完する（既存値は上書きしない・冪等）。

## 生成物

- `data/world_event_impacts.jsonl`: `--write` 実行時に追記される蓄積ログ
- `data/world_event_impacts_latest.json`: Web UI と監査が読む最新スナップショット
- `reports/world-impact-review.json`: 変換結果のレポート
- `reports/world-impact-review.md`: 人間が読むレビュー
- `reports/world-impact-audit.json`: 品質監査結果
- `reports/world-impact-audit.md`: 人間が読む監査サマリー
- `reports/world-impact-intelligence.md`: 件数・mechanism別・confidence帯別・外れ理由ランキング・改善ポイントの統合レポート
- `reports/world-impact-calibration.{md,json}`: confidence帯 / mechanism / lag 別の精度集計
- `reports/world-impact-backfill.json`: backfill 実行結果

## 実行

```bash
pnpm review:world-impact      # 仮説レビュー作成（既定 dry-run）
pnpm audit:world-impact       # 品質監査（v2: JSONL破損・latest不一致・mechanism unknown 等も検出）
pnpm backfill:world-impact    # v1 レコードへの v2 フィールド補完（既定 dry-run、--write で実行）
pnpm report:world-impact      # World Impact Intelligence レポート生成
pnpm calibrate:world-impact   # confidence帯 / mechanism / lag 別の精度集計
pnpm ui:data
pnpm report:ops
```

`pnpm review:world-impact` は既定で dry-run です。`data/world_event_impacts_latest.json` とレポートは更新しますが、JSONL には追記しません。

蓄積ログへ追記する場合だけ、以下を使います。

```bash
pnpm review:world-impact -- --write
```

## 判定ルール

- `dataAvailability !== ok` は未評価として扱う
- `priceDataPending` は価格データ提供待ちとして情報扱いにする
- `result=null` は未評価として扱う
- expected/actual が `unknown` 同士なら hit 扱いにしない
- TOPIX 比較不能な outcome は比較不能として残す
- 反証条件と影響メカニズムが空なら監査で確認対象にする
- 重複 `reviewKey` は監査で緊急扱いにする
- JSONL の破損行は監査で緊急扱いにする（行自体は削除しない）
- `reviewDueAt` が未来なら `pending` のまま。期限超過かつ価格データ不足なら `insufficient_data`
- 外れた場合は miss で終わらせず `missReason` で理由を分類し、`lesson` に学習メモを残す

## 画面

- `/stocks/[code]`: 銘柄に紐づく世界ニュース影響仮説を考察履歴として表示する（mechanism・影響経路・confidence・反証条件・確認シグナル・検証結果・学習メモ）
- `/world-impact`: 影響仮説の一覧。mechanism別集計・検証結果・外れ理由ランキング・pending レビュー
- `/ops`: `world-impact-audit` の件数、未評価、価格データ提供待ち、反証条件未設定、mechanism unknown、JSONL破損、latest不一致を表示する

空データや未生成ファイルがあっても Web UI は落とさず、未記録・未評価・データ不足として表示します。

## 関連

- 実装: `src/world-impact.ts`（純粋ロジック）/ `src/world-impact-{review,audit,backfill,report,calibrate}.ts`（CLI）
- テスト: `tests/world-impact.test.ts` / `tests/world-impact-v2.test.ts`
