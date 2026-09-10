# alpha-pon Roadmap

**このファイルは現行の正本ではありません。**

現行の設計・欠陥台帳・Edge カタログ・実装ロードマップは次を参照してください。

→ [docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md](docs/roadmaps/alpha-pon-current-roadmap-2026-09-10.md)

## なぜ置き換えたか

旧 ROADMAP.md の Phase 1 / 2 / 4 / 8 は既に実装済みで、実態と乖離していた
（`relativeReturnPct` / `maxDrawdownPct` は実装済み、`src/rule-diagnostics.ts` に
5分類すべて存在、`data/company_memory/` も `reports/pipeline_status_latest.json` も生成済み）。

また、目的が「調査候補の記録」から
**「どのエッジが手数料後に生き残るかを測る」** へ変わった。

## 変わらない設計原則

目的が変わっても次は維持する。

- 未確定日時を捏造しない
- SNS・掲示板を signal source にしない
- 件数が少ない学習結果で強い判断をしない
- 自動でルールを削除しない（提案のみ）
- holdout を早期に開けない
- Gross と Net を必ず分けて報告する
- 執行できない取引を執行できたことにしない
- 合成データで通ったテストを、実データの保証とみなさない

変更したのは「買い推奨にしない」の1点のみで、しかもオーナー向け出力に限定する方針。
詳細は正本ロードマップの「維持する原則」を参照。
