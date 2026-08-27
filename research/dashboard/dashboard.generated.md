# Research Dashboard

> このファイルは生成物です。直接編集しないでください（`pnpm research:dashboard` で再生成）。

- 基準日 (asOf): 2026-08-27
- 生成時刻: 2026-08-27T09:07:47.231Z
- Edge: 3 件 / Historical Analog: 0 件 / Counterfactual: 0 件 / Confounder: 0 件
- 整合性: エラー 0 件 / 警告 0 件

## ステータス別

| Status | 件数 |
| --- | --- |
| Production | 0 |
| Shadow | 0 |
| Research | 3 |
| Idea | 0 |
| Rejected | 0 |
| Deprecated | 0 |

## 次に研究するもの（VOI 上位）

| # | Edge | Status | VOI | 理由 | 推奨アクション |
| --- | --- | --- | --- | --- | --- |
| 1 | ex-rights-overreaction-recovery | research | 0.733 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |
| 2 | misconduct-overreaction-recovery | research | 0.723 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |
| 3 | known-bad-event-repricing | research | 0.705 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |

## Promotion Ready（Gate 全通過・人間の昇格判断待ち）

_該当なし_

## Holdout Ready（Holdout 開封以外は揃っている）

_該当なし_

## Edge 一覧

| Edge | Status | Priority | Confidence | Gate | Analog | Sample | Last Update |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ex-rights-overreaction-recovery | Research | A | 0.25 | 0/11 | 0 | 0/120 | 2026-08-27 |
| known-bad-event-repricing | Research | A | 0.20 | 0/11 | 0 | 0/40 | 2026-08-05 |
| misconduct-overreaction-recovery | Research | A | 0.20 | 0/11 | 0 | 0/120 | 2026-08-27 |

## Edge Decay

| Edge | Status | Decay | 最終確認 | 経過日数 | アクション |
| --- | --- | --- | --- | --- | --- |
| ex-rights-overreaction-recovery | research | never_checked | - | - | 初回の Decay 確認を行う |
| known-bad-event-repricing | research | never_checked | - | - | 初回の Decay 確認を行う |
| misconduct-overreaction-recovery | research | never_checked | - | - | 初回の Decay 確認を行う |

## 整合性チェック

_該当なし_

## Checkpoint（次回はここから）

- sequence: 2（保存: 2026-08-27T18:00:30+09:00 / chatgpt-hourly）
- 今回行った研究: 権利落ち後の過剰下落回復Edgeと、不祥事・ガバナンスshock後の過剰下落回復EdgeをResearch OSへ登録し、既存Known-Bad short側・Remediation risk-control側との責務を分離した。あわせて研究結果・過程を読むcanonical順序をREADMEへ明記し、Owner向けWeb /research可視化をIssue #1295として起票した。両Edgeとも実sample未登録のため全Promotion Gateはunknownを維持した。
- 不足データ: 権利落ちEdgeのhistorical優待/配当制度を当時時点で復元した120件以上のsample / 優待cash-equivalent、ex-day first executable price、TOPIX/業種/matched control、信用需給のPIT dataset / 不祥事Edgeの経済実害・会計影響・actor separability・regulatory/litigation・brand damageを一次情報で再現した120件以上のsample / 旧idiosyncratic-shock 27候補をoutcome-blind selection provenanceを維持して現Research OSへ移行するreplay / 両Edgeの成功・非回復・悪化・negative controlとuntouched issuer-level holdout / Owner Web UIでResearch Dashboard / Log / Checkpoint / Analog / Outcomeを統合表示する/read-only research surface
- 次回研究候補:
  - `ex-rights-overreaction-recovery` — 現在VOI 1位。AEON/J Trustのlive observationと過去権利落ちuniverseをPITで接続し、residual dropと回復率を実測する必要がある。
  - `misconduct-overreaction-recovery` — 現在VOI 2位。Sanrioを証明ではなくseedとしてPIT再構成し、旧27候補から勝ち事例だけ選ばずsuccess/non-recovery/controlを移行する必要がある。
  - `known-bad-event-repricing` — formal event通過時のshort repricing研究としてlong recovery Edgeと混同せず、実価格・confounderを接続して役割差を検証する必要がある。
