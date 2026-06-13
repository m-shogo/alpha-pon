# World Impact Intelligence v3 — outcome 自動評価とキャリブレーション

v2 までは世界ニュース影響仮説の「構造化・保存・表示」だった。
v3 は仮説を**実際の株価・ベンチマークと照合して自動評価**し、外れ理由を蓄積し、
次回以降の confidence / direction / mechanism 推定を改善するための基盤。

投資助言ではない。調査候補・仮説検証・反省学習のための機能であり、売買の推奨は行わない。

## v2 と v3 の違い

| | v2 | v3 |
|---|---|---|
| 仮説 | 構造化して保存（mechanism / falsification / confidence 等） | 同左 |
| outcome | 期日管理のみ（result は手動 or 未評価） | **価格・ベンチマークと照合して自動評価** |
| 外れ理由 | 手動分類（missReason） | **autoMissReason（自動推定）と manualMissReason（手動）を分離** |
| calibration | confidence帯 / mechanism / lag の件数集計 | **direction / source / 銘柄 / テーマ別 + 過大/過小 confidence 一覧 + 調整候補** |
| audit | 欠損・重複・JSONL破損 | **期限切れ未評価・enum外・confidence範囲外・return不整合も検査** |

## outcome 自動評価の仕様（pnpm evaluate:world-impact）

```bash
pnpm evaluate:world-impact                     # dry-run（既定・何も書き換えない）
pnpm evaluate:world-impact --write             # JSONL / latest に保存
pnpm evaluate:world-impact --as-of 2026-09-01  # 評価基準日を指定
pnpm evaluate:world-impact --horizon 1w        # 1d|1w|1m|all
pnpm evaluate:world-impact --code 4661         # 銘柄絞り込み
```

- 評価対象は「期日（dueAt）が評価基準日を過ぎていて result 未確定」の outcome のみ
- 既存 outcome を**置き換えで更新**するため、同じ reviewKey + horizon の二重作成は構造的に起きない
- 既存値は上書きせず欠損のみ補完。**manualMissReason は絶対に触らない**
- 評価済み（hit/miss/inverse/unclear/insufficient_data）の outcome は再評価しない（冪等）

### 判定の流れ

1. 基準価格 = イベント日以降の最初の終値、評価価格 = 期日以降の最初の終値
2. `priceReturnPct` を計算、ベンチマーク（1306 = TOPIX 連動 ETF）と比較して `relativeReturnPct` を計算
3. 変化率が閾値（±1.5%）未満 → **unclear**（autoMissReason: `low_magnitude`）
4. 想定方向が未設定 → **unclear**（hit にしない）
5. 想定方向と一致 → **hit**
6. 逆方向 → **inverse**。ベンチマークも同方向なら autoMissReason: `macro_overpowered`、それ以外は `wrong_direction`
7. 価格データが無い → **insufficient_data**（miss にしない）

### result の定義

| result | 意味 |
|---|---|
| `hit` | 想定方向と実際の方向が一致（仮説と整合する観察） |
| `miss` | 想定と差分あり（手動レビューで使用） |
| `inverse` | 想定と逆方向に動いた |
| `unclear` | 判定不能（値動きが小さい・想定方向未設定など） |
| `insufficient_data` | 価格データ不足で判定不能 |

### J-Quants 遅延・価格欠損時の扱い

- J-Quants 無料プランは約84日の提供遅延がある。期日が遅延範囲内の outcome は
  **priceDataPending としてスキップ**し、result は触らない（待機が正常）
- 遅延期間を過ぎても価格が無い場合のみ `insufficient_data` にする
- データ不足を miss として精度集計に混ぜない

## autoMissReason と manualMissReason

- `autoMissReason`: 評価エンジンがルールベースで推定した外れ理由。根拠が弱ければ `unclear` に逃がす
- `manualMissReason`: 手動レビューで記録する分類。**自動評価は絶対に上書きしない**
- v2 までの `missReason` は互換のため保持され、normalize で `manualMissReason` に引き継がれる
- 両方が存在して分類が矛盾する場合は audit が `missReasonConflicts` として検出する（手動を優先）

autoMissReason の分類: `too_early` / `too_late` / `already_priced_in` / `wrong_mechanism` /
`wrong_direction` / `weak_stock_linkage` / `macro_overpowered` / `company_specific_overpowered` /
`theme_not_traded` / `low_magnitude` / `insufficient_data` / `unclear`
（現在の自動推定は wrong_direction / macro_overpowered / low_magnitude / insufficient_data / unclear のみ。残りは手動分類か今後の拡張）

## confidence calibration の読み方（pnpm calibrate:world-impact）

`reports/world-impact-calibration.md` に出力される。

- **confidence帯別**: 高 confidence の整合率が低ければ、初期 confidence の付け方が過大
- **High Confidence Misses**: confidence ≥ 0.5 で外れた仮説。confidence を下げるべき条件のヒント
- **Low Confidence Hits**: confidence ≤ 0.4 で整合した仮説。慎重すぎた条件のヒント
- **調整候補**: 評価サンプルが5件以上あるグループのみ提示。サンプル不足の間は参考値
- 整合率は投資判断の根拠ではなく、**仮説生成ルールの改善材料**として読む

## 手動レビュー手順

1. `pnpm evaluate:world-impact` で自動評価（dry-run で内容確認 → `--write`）
2. `/world-impact` で inverse / unclear / high confidence miss を確認
3. 外れた仮説には `manualMissReason` と `lesson` を JSONL で記録（自動評価は消さない）
4. `pnpm calibrate:world-impact` → `pnpm report:world-impact` で学習メモを更新
5. `pnpm audit:world-impact` で不整合がないか確認

## 関連

- 実装: `src/world-impact.ts`（評価純関数）/ `src/world-impact-evaluate.ts`（CLI）
- テスト: `tests/world-impact-v3.test.ts`
- safe wording: `docs/safe-output-audit.md`
- v2 仕様: `docs/world-event-impact-review.md`

## 今後の改善余地

- autoMissReason の残り分類（already_priced_in / theme_not_traded 等）の自動推定
- expectedLagDays と actualLagDays の乖離からの too_early / too_late 推定
- direction（positive/negative）の自動推定（現状 unclear 起点で手動更新）
- 評価サンプルが貯まった後の confidence 初期値の自動調整
