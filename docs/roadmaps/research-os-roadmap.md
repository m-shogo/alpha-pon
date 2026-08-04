# Research OS ロードマップ

Research OS 自体の改善計画。**研究テーマの計画ではありません**（それは Edge Registry と Queue の担当）。

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

## 既知の制約（v1 時点で正直に）

| 制約 | 影響 | 解消の条件 |
| --- | --- | --- |
| 実価格の履歴系列がリポジトリに無い（`data/prices/` は空） | **Net Alpha の実測値が 1 件も無い**。Backtest は fixtures の合成データでしか回っていない | 価格取得の実装（J-Quants など）と `research/prices/` への PIT 保存 |
| ベンチマーク系列も未整備 | 超過収益（Alpha）を実データで測れない | 同上 |
| 借株コスト・貸株可否の実データが無い | ショート系 Edge の Net Alpha は仮定値でしか出せない | 証券会社の貸借データ取得 |
| Edge が 0 件（OS だけが先にある状態） | Queue / Dashboard は空 | ChatGPT の毎時研究で埋まっていく |

**この制約があるため、v1 の時点で Production に上げられる Edge は存在しません。**
Production Gate の `netAlphaPositive` は、実価格が入るまで構造的に `pass` にできません。

## v2 候補（優先順）

1. **PIT 価格ストア** — `research/prices/<code>.jsonl` に「取得時点」付きで保存し、
   後から改訂されたデータで過去を書き換えられない構造にする（Append Only）。
   これが入るまで Net Alpha は評価不能なので、最優先。
2. **Signal Store** — Backtest の入力シグナルを Edge から自動生成する
   （今は bundle を手で作る必要がある）。
3. **Confounder の自動候補出し** — 同日の指数イベント・決算・大口売買を
   一次データから機械的に列挙し、`acknowledged_unresolved` の取りこぼしを減らす。
4. **Edge Diversity / Correlation 監視** — Edge 同士の相関が高いと
   分散しているつもりで同じリスクを取ることになる。Registry に相関クラスタを持たせる。
5. **Opportunity Cost の明示** — Queue に「これを研究しないことの損失」を出す。
6. **Decay の自動再計算** — 直近サンプルと過去サンプルの Net Alpha 差から
   `decay.score` を機械的に更新する（今は手入力）。

## 保守の観点（定期レビュー項目）

- 重複: 似た Edge が増えていないか（`similar_hypothesis` 警告の推移）
- 設計不整合: `types.ts` と `schemas/*.json` のズレ（`dashboard.test.ts` が検知）
- 技術的負債: CLI の重複コード、`validate` と `dashboard` のチェック処理の二重定義
- ボトルネック: Edge 数が増えたときの近似重複検知は O(n²)。100 件を超えたら見直す
- 監査性: 生成物を手編集した形跡がないか（CI の再生成差分で検知）
