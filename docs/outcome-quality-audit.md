# 仮説レビュー品質監査 v1

`pnpm audit:outcomes` は、調査候補を出しっぱなしにせず、1d/1w/1m の答え合わせ品質を自動監査する。
売買の推奨は行わない。

## チェック項目

| キー | 内容 | 重さ |
|---|---|---|
| `reviewMissing` | detectedAt があるのに outcome 記録が一件もない（1d 期日超過後） | 確認 |
| `horizonGaps` | 期日が到来した 1d/1w/1m の記録が欠けている | 確認 |
| `judgedWithLimitedData` | dataAvailability が ok でないのに hit/miss 判定が入っている | 確認 |
| `unknownMatchedAsHit` | expected/actual とも unknown なのに hit 扱い（精度集計を歪める） | **要対応** |
| `pendingWithSignals` | whatMatched が空でないのに未評価のまま | 確認 |
| `emptyReviewNotes` | 判定済みなのに notes / missedSignals が空（反省未記入） | 確認 |
| `dueAtMismatch` | reviewDueAt と expectedTimeframe がズレている | 確認 |

`unknownMatchedAsHit` が 1件でもあると healthStatus は `action_required`、
それ以外の指摘のみなら `needs_attention`、指摘ゼロで `ok`。

期日判定は暦日 + 猶予3日（週末吸収）。stale fallback の warning 重複は
ops dashboard（`pnpm report:ops`）側が担当する。

## 出力ファイル

- `reports/outcome-quality-audit.md` — 人間が読む用（項目ごとに該当銘柄を列挙）
- `reports/outcome-quality-audit.json` — 機械可読（schema は `src/outcome-quality-audit.ts` の `OutcomeQualityAudit` 型）

## /ops への統合

`pnpm report:ops` が `reports/outcome-quality-audit.json` を読み取り、

- `unknownMatchedAsHit` > 0 → 緊急 issue として優先対応 TOP5 に出す
- その他の指摘 → まとめて「仮説レビュー品質: 改善対象 N件」として出す
- `/ops` ページに「仮説レビュー品質監査」セクションとしてチェック別件数を表示

`pnpm check` / `pnpm daily:full` には `ui:data → audit:outcomes → report:ops` の順で組み込み済み。

## 実行順の注意

監査対象は生成済みの `apps/web/public/generated/hypotheses.json` / `outcomes.json` なので、
単体で実行する場合は先に `pnpm ui:data` を実行する。

## 関連

- 実装: `src/outcome-quality-audit.ts`（純粋ロジック）/ `src/outcome-quality-audit-report.ts`（入出力）
- テスト: `tests/outcome-quality-audit.test.ts`
- ダッシュボード: `docs/ops-dashboard.md`
