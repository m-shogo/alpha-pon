# Research Dashboard

> このファイルは生成物です。直接編集しないでください（`pnpm research:dashboard` で再生成）。

- 基準日 (asOf): 2026-08-07
- 生成時刻: 2026-08-07T04:50:10.173Z
- Edge: 1 件 / Historical Analog: 0 件 / Counterfactual: 0 件 / Confounder: 0 件
- 整合性: エラー 0 件 / 警告 0 件

## ステータス別

| Status | 件数 |
| --- | --- |
| Production | 0 |
| Shadow | 0 |
| Research | 1 |
| Idea | 0 |
| Rejected | 0 |
| Deprecated | 0 |

## 次に研究するもの（VOI 上位）

| # | Edge | Status | VOI | 理由 | 推奨アクション |
| --- | --- | --- | --- | --- | --- |
| 1 | known-bad-event-repricing | research | 0.705 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |

## Promotion Ready（Gate 全通過・人間の昇格判断待ち）

_該当なし_

## Holdout Ready（Holdout 開封以外は揃っている）

_該当なし_

## Edge 一覧

| Edge | Status | Priority | Confidence | Gate | Analog | Sample | Last Update |
| --- | --- | --- | --- | --- | --- | --- | --- |
| known-bad-event-repricing | Research | A | 0.20 | 0/11 | 0 | 0/40 | 2026-08-05 |

## Edge Decay

| Edge | Status | Decay | 最終確認 | 経過日数 | アクション |
| --- | --- | --- | --- | --- | --- |
| known-bad-event-repricing | research | never_checked | - | - | 初回の Decay 確認を行う |

## 整合性チェック

_該当なし_

## Checkpoint（次回はここから）

- sequence: 1（保存: 2026-08-05T03:29:00.000Z / chatgpt-hourly）
- 今回行った研究: 既存のKnown-Bad Event Repricing研究をResearch OSの最初のEdgeへ移し、機構、対象event、PIT条件、entry/exit候補、交絡、執行制約、反証条件、source policy、hard blockerを固定した。実価格とAnalogが無いため全Promotion Gateはunknownのまま維持した。
- 不足データ: PIT安全な個別株OHLCV・TOPIX・業種benchmark・corporate action価格ストア / formal eventごとのpublicObservedAtとfirstExecutableAt / 同日決算・業績修正・資本政策・指数・大口売買のconfounder ledger / 貸株可否・逆日歩・borrow cost・spread・liquidity / immutable Historical Analogの初期sample / matched controlとgeneric reversal model
- 次回研究候補:
  - `known-bad-event-repricing` — 最初のEdgeとして登録したが、Sanrio calibration timeline、Analog、PIT価格、confounderが未接続で最優先の継続研究が必要。
  - `exchange-sanction-ladder` — 正式状態遷移という機構が近く、Known-Bad umbrellaへ統合する範囲と独立Edgeにする範囲を先に確定する必要がある。
  - `external-incident-venue-negative-control` — 会社内部の問題と外部事件の舞台化を分離するnegative controlが、交絡除去と反証力を高める。
