# Research Dashboard

> このファイルは生成物です。直接編集しないでください（`pnpm research:dashboard` で再生成）。

- 基準日 (asOf): 2026-09-03
- 生成時刻: 2026-09-03T03:12:05.530Z
- Edge: 3 件 / Historical Analog: 0 件 / Counterfactual: 0 件 / Confounder: 0 件
- 整合性: エラー 0 件 / 警告 0 件

## ステータス別

| Status | 件数 |
| --- | --- |
| Production | 0 |
| Shadow | 0 |
| Research | 2 |
| Idea | 0 |
| Rejected | 0 |
| Deprecated | 1 |

## 次に研究するもの（VOI 上位）

| # | Edge | Status | VOI | 理由 | 推奨アクション |
| --- | --- | --- | --- | --- | --- |
| 1 | ex-rights-overreaction-recovery | research | 0.733 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |
| 2 | misconduct-overreaction-recovery | research | 0.725 | Decay 再検証の期限が来ている / 1回の研究で不確実性が大きく減る / Historical Analog が不足している | Decay 再検証：直近データで Edge がまだ生きているか確認する |

## Promotion Ready（Gate 全通過・人間の昇格判断待ち）

_該当なし_

## Holdout Ready（Holdout 開封以外は揃っている）

_該当なし_

## Edge 一覧

| Edge | Status | Priority | Confidence | Gate | Analog | Sample | Last Update |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ex-rights-overreaction-recovery | Research | A | 0.25 | 0/11 | 0 | 0/120 | 2026-08-27 |
| misconduct-overreaction-recovery | Research | A | 0.20 | 0/11 | 0 | 0/120 | 2026-08-27 |
| known-bad-event-repricing | Deprecated | C | 0.20 | 0/11 | 0 | 0/40 | 2026-08-27 |

## Edge Decay

| Edge | Status | Decay | 最終確認 | 経過日数 | アクション |
| --- | --- | --- | --- | --- | --- |
| ex-rights-overreaction-recovery | research | never_checked | - | - | 初回の Decay 確認を行う |
| known-bad-event-repricing | deprecated | never_checked | - | - | 初回の Decay 確認を行う |
| misconduct-overreaction-recovery | research | never_checked | - | - | 初回の Decay 確認を行う |

## 整合性チェック

_該当なし_

## Checkpoint（次回はここから）

- sequence: 3（保存: 2026-08-27T18:12:27+09:00 / chatgpt-hourly）
- 今回行った研究: Known-Bad Event Repricingを独立Edgeから外し、Misconduct Overreaction Recovery Edgeの正式イベント後secondary repricing/timing filterへ統合した。初期shock、実害評価、正式イベント、remediation、回復を1本のissuer timelineで研究し、同一不祥事の二重sample化を防ぐ。旧Known-Bad Edgeはprovenance保持のためdeprecatedとし、独立short Promotionを停止した。
- 不足データ: 不祥事ごとにinitial shockからformal event、remediation、D+120 outcomeまでを同一sample IDで結ぶincident timeline contract / formal eventのknown fact/new fact差分、publicObservedAt、firstExecutableAtのPIT復元 / event直前entry、event後first executable、D+1、D+3、D+5のentry timing比較 / 旧idiosyncratic-shock 27候補と旧Known-Bad候補の重複除去・outcome-blind replay / Sanrio calibration timelineと成功・非回復・悪化・negative controlを含む120件以上のsample / Owner Web UIでResearch Dashboard / Log / Checkpoint / Analog / Outcomeを統合表示するread-only research surface
- 次回研究候補:
  - `ex-rights-overreaction-recovery` — 現在の別系統A優先Edge。AEON/J Trust live observationとhistorical権利落ちuniverseをPIT接続してresidual dropと回復率を実測する。
  - `misconduct-overreaction-recovery` — Known-Badを統合した単一不祥事EdgeとしてSanrioをphase1〜phase5へPIT再構成し、旧候補を勝ち事例だけ選ばず移行する。
