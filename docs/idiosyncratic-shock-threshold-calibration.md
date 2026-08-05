# 企業固有ショック — Threshold Calibration Shadow Policy

> このファイルは詳細policyの正本。現在地の短縮版はPR #1 bodyと専用reportを参照する。

## 現在の結論

- Production thresholdは **12/20のまま**。
- ProductionとThreshold-calibration shadowは分離する。
- Shadowはscore gateだけを外し、調査未完・会計・規制・confounder・recurrence・incident cascade等のhard gateは緩めない。
- `data/idiosyncratic_shock_outcomes.json` はまだ正式生成しない。
- retrospective historical researchをprospective OOSと呼ばない。
- historical returnが未生成/未検証の段階で「戦略は勝てる」「12点が最適」と結論しない。

## Below-threshold shadow controls

### Explicit PASS

| Case | Score | Market | Production | Shadow |
|---|---:|---|---|---|
| Ootoya 2019 employee video | 11 | JP | BLOCK | PASS |
| United Flight 3411 2017 | 10 | US | BLOCK | PASS |

両方ともProductionではscore<12のためBLOCK。Shadow PASSは、checkpoint-safe evidenceで非score hard gateを通過した場合だけ許可する。

### Explicit / deterministic BLOCK examples

- Papa John's 2018 — 11: open investigation
- CBS 2018 — 11: independent investigation継続
- Super Retail 2025 — 10: implications未確定
- KDDI 2026 — 10: accountingIntegrity=0 + major confounder
- Wynn Resorts 2018 — 9: open investigation + gaming license risk
- KADOKAWA 2022 — 9: criminal process / multiple actors
- Benesse 2014 — 9: investigation open
- Dentsu 2016 — 8: investigation open + systemic recurrence
- Sukiya 2025 — 8: open investigation + major confounder + incident cascade
- Activision Blizzard 2021 — 8: open investigation + systemic recurrence + weak remediation
- Kobayashi Pharma 2024 — 8: health-impact investigation open
- Starbucks Philadelphia 2018 — 11: external civil-rights review open
- Chipotle 2015 — 7: incident cascade（8–11帯外でもそのまま受け入れる）

件数合わせでBLOCKをPASSへ変えない。

## Outcome-blind threshold candidate backlog

`data/idiosyncratic_shock_threshold_candidate_backlog.yml` では候補を**採点前**にfreezeする。

Candidate selectionに使ってよいもの:

- market / jurisdiction coverage
- category coverage
- primary-source availability
- event structure

候補選定・順位付けに使ってはいけないもの:

- score / scoreVector
- future return
- recovery pattern
- realized outcome
- post-event price path

初回freeze batchは5件すべて研究完了:

| Candidate | PIT score | Result |
|---|---:|---|
| Benesse 2014 | 9 | shadow BLOCK |
| Dentsu 2016 | 8 | shadow BLOCK |
| Chipotle 2015 | 7 | band外 / shadow BLOCK |
| Guess 2018 | 12 | Production threshold側 |
| Starbucks 2018 | 11 | shadow BLOCK |

この結果は成功。目的はPASSを作ることではなく、結果を見る前に選んだ候補をPIT evidenceでそのまま分類できることを証明すること。

`src/idiosyncratic-shock-threshold-candidate-backlog.ts` は、active candidateが0なのにthreshold diversityが未達なら `replenishmentRequired=true` を返す。batchを完了しただけで「研究完了」と誤認しない。

## PIT source gate

### Case本体source

- `publishedAt` がある場合、`publishedAt <= decisionCheckpoint` だけをeligibilityへ使用。
- future / malformed dateはPASS根拠から除外。
- legacy undated sourceは後方互換の技術負債としてPIT Source Auditで可視化する。

### Sidecar evidence

`strategyEligibilityEvidenceSources` はvalid `publishedAt` 必須。

- `publishedAt <= decisionCheckpoint` の資料だけ利用。
- future / undated sidecar evidenceはfail-closed。
- Production / Shadowのresolver本体で同じruleを使う。

## Runtime context contract

Historical context YAMLはruntime enum/type validatorを通す。

Shock Contractsでは**ロードされた全historical context overlayを総当たりvalidate**する。独自ラベルを静かに追加しない。

例:

- `incidentScope`: `individual | site | multi_unit | company_wide | unknown`
- `recurrenceStatus`: `first_known | related_multiple | systemic | unknown`

## Reaction anchor

Evidenceだけでreplay-readyにしない。

1. announcement timing known
2. reaction dateがYYYY-MM-DD
3. evidence sourceあり
4. provenance noteあり
5. stockにreaction dateの実日足
6. benchmarkにも同日の実日足

5/6はformal outcome生成時にprice provider側で二重確認する。片方でも欠ければunverifiedへ降格し、signal率の分母にも入れない。

## Signal率とreturnを分離

no-signalを0% returnへ変換しない。

各bucketで別々に保存する:

- eligibleCases
- signal cases
- signalRate
- signal後return
- benchmark-relative return
- median
- positive rate

## Case selection / research definition freeze

Historical caseにはselection provenanceを持たせる。

- `retrospective_research`
- `prospective_pre_outcome`
- `matched_negative_control`

既存historical caseを後付けでprospective holdoutにしない。

`idiosyncratic-shock-research-snapshot-contract` でoutcome前研究入力をSHA256固定する:

- facts
- score
- checkpoint
- sources
- context / eligibility evidence
- reaction anchor
- case-selection provenance

realized future outcomeはhash対象外。

## Outcome contract

Formal datasetは `shock-outcome-v1` methodology contractへ完全一致させる。

- adjusted close
- signal-session close entry
- horizons 7/30/90/365 calendar days
- horizon当日以降の最初の取引session
- benchmark relative = stock return - benchmark return
- production threshold=12
- shadowはscore gateだけ除外
- no-signalはreturn=0にしない
- prospective holdoutをdefault fittingから除外
- research snapshot hashをdatasetへbinding
- aggregateはrecordsから再計算して一致を要求

## Matched negative control

Shock固有効果と「単に暴落株が反発した」を分離する。

future returnをmatcher入力に使わない。

- same market
- same sector
- same reaction date
- similar raw drawdown
- similar benchmark-relative drawdown
- known shock除外
- material corporate event除外
- abnormal liquidity除外

## Threshold変更最低gate

最低条件:

- below-12 replay-ready controls >= 8
- score 10–11 >= 4
- score 8–9 >= 2
- distinct categories >= 3
- JP >= 2
- US >= 2
- usable shadow 3m outcomes >= 8
- retrospective chronological robustness
- validated local modelにはprospective pre-outcome holdout >= 8

これらは「thresholdを下げてよい条件」ではなく、**再評価を始められる最低条件**。

未達ならProduction threshold=12を維持する。

## Validation sequence

1. outcome-blind candidate selection
2. incident DB / checkpoint reconstruction
3. PIT evidence
4. Production / Shadow eligibility
5. reaction anchor
6. stock + benchmark trading-session validation
7. signal/no-signal
8. benchmark-relative forward outcome
9. matched negative controls
10. retrospective chronological validation
11. prospective pre-outcome holdout
12. threshold / local registry再評価

## CI status

`.github/workflows/shock-contracts.yml` に専用contractを分離している。

ただしGitHub Actionsは現在、job生成直後にfailureし `steps=null / logs_url=null`、job log取得もBlobNotFoundとなることがある。checkout / install / typecheck / testへ到達した証跡が無いため、**greenとは扱わない**。

PR #1はDraft維持・merge禁止。
