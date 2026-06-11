# 運用ダッシュボード（運用司令塔 v1）

`pnpm report:ops` が生成する統合サマリー。毎朝の daily 実行後に
「今日は何が問題で、どの仮説を確認すべきで、次に何を実行すべきか」を一画面で確認する。

売買の推奨は行わない。表現は「調査候補」「監視対象」「追加調査」「保留」「未評価」「反証条件」「データ不足」「確認対象」に限定する。

## 何を見る画面か

| セクション | 内容 | 元データ |
|---|---|---|
| healthStatus | ok / needs_attention / action_required | 下記すべての監査結果から算出 |
| 優先対応 TOP5 | severity（緊急/確認/情報）順の課題 | 同上 |
| 仮説レビュー状況 | outcome の result 内訳、採点期限超過、データ不足のまま判定済み、整合性 | `outcomes.json` / `special_situation_ops_summary_latest.json` / `hypothesis_outcome_integrity_latest.json` |
| データ品質 | 銘柄ごとの品質レベル、universe scan fallback、warning 重複 | `alpha-pon-data.json` の `dataQualityByCode` / `universeScan` |
| パイプライン / UIデータ | daily の成否・本日分か、生成 JSON の鮮度・meta warnings | `pipeline_status_latest.json` / `alpha-pon-data.json` |
| 安全表現チェック | 生成物（generated JSON・latest レポート）の禁止文言スキャン | `apps/web/public/generated/*.json` / `reports/*_latest.md` |
| 次の安全コマンド | 課題に対応する読み取り系・dry-run コマンドの一覧 | 課題から導出 |

ソースコード側（`src/` `apps/`）の安全表現は従来どおり `tests/safe-wording.test.ts` が担当し、
このダッシュボードは「実行時に生成された成果物」を監査する。

## 出力ファイル

- `reports/ops-dashboard.md` — 人間が読む用
- `reports/ops-dashboard.json` — 機械可読（schema は `src/ops-dashboard.ts` の `OpsDashboard` 型）
- `apps/web/public/generated/ops-dashboard.json` — `/ops` ページ表示用のコピー

## 毎朝の確認手順

1. launchd の daily 実行後（または手動で `pnpm daily`）、`pnpm report:ops` を実行する。
   `pnpm daily:full` / `pnpm check` には組み込み済みなので、そちらを使う場合は個別実行不要。
2. `/ops` ページ（`pnpm web:dev` → http://localhost:3000/ops ）か `reports/ops-dashboard.md` を開く。
3. healthStatus を確認する。
   - `ok` — そのまま通常運用。
   - `needs_attention` — 優先対応 TOP5 の「確認」項目を見て、表示されている安全コマンドを dry-run で実行する。
   - `action_required` — 下記「action_required 時の対応」へ。
4. 仮説レビュー状況で「採点期限超過」「データ不足のまま判定済み」が増えていないか確認する。

## action_required 時の対応

action_required になる条件と対応:

| 原因 | 対応 |
|---|---|
| pipeline に失敗ステップ | `logs/` と `reports/pipeline_status_latest.json` を確認し、`pnpm daily` を再実行 |
| UI 生成データが読み込めない | `pnpm ui:data` を実行して再生成 |
| outcome 整合性エラー（重複 / parse_error） | `pnpm outcomes:integrity` で詳細を確認 |
| 特殊状況ウォッチが action_required | 表示されたコマンド（例: `pnpm review:special-due`）を実行 |
| 安全表現違反 | 該当ファイル・行を開いて表現を修正（違反語はマスク表示されるため原文はファイル側で確認） |

いずれも「次に実行する安全コマンド」欄に対応コマンドが出る。書き込み系（`--write`）は表示しない。

## 実行コマンド一覧

```bash
pnpm report:ops      # ダッシュボード生成
pnpm health          # 全体ヘルスチェック
pnpm ui:data         # UI 生成データの再生成
pnpm ops:special     # 特殊状況ウォッチの ops summary
pnpm review:special-due        # 採点期限キュー確認
pnpm backfill:special-outcomes # outcome 補完（デフォルト dry-run）
pnpm outcomes:integrity        # outcome 整合性レポート
```

## 関連

- 実装: `src/ops-dashboard.ts`（純粋ロジック）/ `scripts/report-ops-dashboard.ts`（入出力）
- UI: `apps/web/app/ops/page.tsx` / `apps/web/lib/ops-dashboard.ts`
- テスト: `tests/ops-dashboard.test.ts`
