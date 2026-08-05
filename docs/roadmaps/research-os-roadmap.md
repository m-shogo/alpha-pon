# Research OS ロードマップ

Status: `ACTIVE_COMPONENT_ROADMAP`
Updated: 2026-08-05 JST

Research OS 自体の改善計画。**研究テーマの計画ではありません**（それは Edge Registry と Queue の担当）。
Alpha Pon全体の優先順位は [alpha-pon-current-roadmap-2026-08-05.md](./alpha-pon-current-roadmap-2026-08-05.md)、実行主体の振り分けは [../operations/agent-work-routing.md](../operations/agent-work-routing.md) を正本とする。

## v1（2026-08-04 実装済み）

- Edge Registry（1 Edge 1 ファイル / 重複・近似重複検知 / 参照整合性）
- JSON Schema 群 + 依存ゼロの validator（未対応キーワードは例外にして仕様とのズレを防ぐ）
- Research Queue / VOI Scheduler（決定論的スコアリング、同点は id 順）
- Checkpoint（sequence 採番・履歴 immutable・`nextCandidates` 必須）
- Historical Analog / Counterfactual / Confounder ストア
- PIT / Future Leakage 検知（`observedAt` 基準、当日引けエントリの可否判定）
- Append Only / 不変性ガード（git diff ベース）
- Backtest Framework（Entry/Exit/Holding/Borrow/Liquidity/Slippage、価格は注入）
- Net Alpha Engine（往復コスト・借株・インパクト・False Discovery Guard）
- Holdout Vault（封印定義・開封記録・Gate との紐付け）
- Edge Decay Monitor / Production Gate（11項目・自己申告 pass の禁止）
- Research Dashboard / Research Log
- CI（整合性・生成物の再生成差分・履歴ガード・fixtures backtest・テスト）
- 最初の実働Edge `known-bad-event-repricing`、Research Log、Checkpointを登録

## 現在の制約（2026-08-05時点で正直に）

| 制約 | 影響 | 解消の条件 |
| --- | --- | --- |
| 実価格の履歴系列がResearch OSに無い | **Net Alpha の実測値が 1 件も無い**。Backtest は fixtures の合成データでしか回っていない | 価格取得providerと `research/prices/` へのPIT-safe保存 |
| ベンチマーク系列も未整備 | 超過収益（Alpha）を実データで測れない | PIT Price StoreへTOPIX・業種benchmarkを接続 |
| 借株コスト・貸株可否の実データが無い | ショート系 Edge の Net Alpha は仮定値でしか出せない | 利用可能な貸借データとライセンス境界の確定 |
| Edgeは1件あるがHistorical Analog / Counterfactual / Confounderが0件 | Queueは動くが、Gateを実証的に進められない | 毎時研究で一次情報に基づくimmutable recordを追加 |
| 最初のEdgeはGate `0/11`、sample `0/40` | Production昇格不能 | PIT価格・Analog・交絡・execution・holdoutを順番に検証 |

**この制約があるため、現在 Production に上げられる Edge は存在しません。**
Production Gate の `netAlphaPositive` は、実価格が入るまで構造的に `pass` にできない。

## v2 実装順

実装・ローカル実行・テストを要する項目はClaude CodeまたはCodexへ渡し、ChatGPT Scheduled Tasksは研究要件、Queue/Checkpoint、一次情報調査とレビューを担当する。

1. **PIT Price Store** — `research/prices/<code>.jsonl` に「取得時点」付きで保存し、
   後から改訂されたデータで過去を書き換えられない構造にする（Append Only）。
   これが入るまで Net Alpha は評価不能なので最優先。
2. **最初の実データ系列検証** — issuer、TOPIX、業種benchmark、corporate actionを
   同じPIT契約で取り込み、未来参照・重複改訂・調整二重適用をテストする。
3. **Signal Store** — Backtest の入力シグナルを Edge / Market Event から自動生成する
   （今は bundle を手で作る必要がある）。
4. **Event Study実データ接続** — entry route、benchmark調整、cost、liquidity、borrowを
   分離してGrossとNet Alphaを測る。
5. **Confounder の自動候補出し** — 同日の指数イベント・決算・大口売買を
   一次データから機械的に列挙し、`acknowledged_unresolved` の取りこぼしを減らす。
6. **Edge Diversity / Correlation 監視** — Edge 同士の相関が高いと
   分散しているつもりで同じリスクを取ることになる。Registry に相関クラスタを持たせる。
7. **Opportunity Cost の明示** — Queue に「これを研究しないことの損失」を出す。
8. **Decay の自動再計算** — 直近サンプルと過去サンプルの Net Alpha 差から
   `decay.score` を機械的に更新する（今は手入力）。

## 実行ルール

- ChatGPT Scheduled Tasksは、P0 scan、Queue/Checkpoint読取、一次情報研究、Research Log/Checkpoint更新を担当する。
- ローカル未コミット変更、shell、tests/build、複数ファイル実装、local DB、heavy backfill、browser/credential操作はClaude CodeまたはCodexへhandoffする。
- Scheduled Taskは外部コードエージェントを自動起動したと主張しない。
- handoffは [../prompts/code-agent-handoff-template.md](../prompts/code-agent-handoff-template.md) を使い、GitHubへ残す。
- 同じbranch/filesへClaude CodeとCodexを同時に割り当てない。
- 実装後はChatGPTがPR、diff、CI、データ妥当性、外部deployment状態を分けてレビューする。

## 保守の観点（定期レビュー項目）

- 重複: 似た Edge が増えていないか（`similar_hypothesis` 警告の推移）
- 設計不整合: `types.ts` と `schemas/*.json` のズレ（`dashboard.test.ts` が検知）
- 技術的負債: CLI の重複コード、`validate` と `dashboard` のチェック処理の二重定義
- ボトルネック: Edge 数が増えたときの近似重複検知は O(n²)。100 件を超えたら見直す
- 監査性: 生成物を手編集した形跡がないか（CI の再生成差分で検知）
- 実行重複: 同じhandoffがClaude CodeとCodexへ二重投入されていないか
- 停滞: 同じ外部blockerを毎時繰り返さず、Issue/handoffへ固定できているか
