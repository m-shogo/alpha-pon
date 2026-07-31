# 企業固有ショック — Research Integrity Chain

## 目的

この文書は、企業固有ショック研究で「結果を見てから研究条件を変える」「retrospective事例をprospective OOSと呼ぶ」「古い集計を新しい定義へ使い回す」といった研究上の抜け道を防ぐための正本である。

Production thresholdは現在 **12/20**。この文書の契約を満たしても、それだけでthreshold変更や戦略収益性を証明したことにはならない。

## Integrity chain

```text
historical case facts
  ↓
PIT eligibility evidence
  ↓
production / threshold-calibration eligibility
  ↓
reaction anchor evidence + exact trading session
  ↓
case-selection provenance
  ↓
pre-outcome research snapshot SHA256
  ↓
record-level quantitative outcomes
  ↓
record-derived calibration aggregates
  ↓
retrospective chronological temporal validation
  ↓
prospective pre-outcome holdout
  ↓
validated local registry
```

各段階は後段だけで補正してはいけない。前段が変わった場合は、その前段に依存する後段を再生成・再検証する。

## 1. PIT evidence

### Historical case source

- `publishedAt` があるsourceは `publishedAt <= decisionCheckpoint` の場合だけeligibilityに使用する。
- checkpoint後sourceを過去PASSの根拠へ逆流させない。
- legacy undated sourceは後方互換上の技術負債として別auditで可視化する。

### Sidecar eligibility evidence

後付けの `strategyEligibilityEvidenceSources` はさらに厳格にする。

- valid `publishedAt` 必須
- `publishedAt <= decisionCheckpoint` 必須
- future / undatedはfail-closed

Productionとthreshold-calibration shadowは同じPIT source gateを使う。

## 2. Production / threshold-calibration separation

### Production

`strategyEligibilityAtCheckpoint`

- score >= 12を含む現行運用parity
- score < 12はBLOCK

### Threshold calibration

`calibrationEligibilityAtCheckpoint`

- score gateだけを外す
- accounting / macro / investigation / critical license-listing risk / confounder / source / recurrence / remediation / liquidity / incident cascade等のhard gateは維持

score < 12を自動PASSにしない。

## 3. Reaction anchor

Evidenceだけでreaction dateをverifiedにしない。

正式outcomeでは:

1. evidence側anchorがverified
2. stockにreactionStartDateの実日足が存在
3. benchmarkにも同日の実日足が存在

をすべて要求する。

欠損時:

- `reactionAnchorStatus=unverified`
- production/shadow signalを生成しない
- signal率の分母にも入れない

## 4. Case-selection provenance

正本:

```text
data/idiosyncratic_shock_case_selection.yml
```

mode:

- `retrospective_research`
- `prospective_pre_outcome`
- `matched_negative_control`

prospective holdout eligible条件:

- `selectionMode=prospective_pre_outcome`
- `outcomeVisibilityAtSelection=not_observed`
- `decisionCheckpointAtRegistration` を登録時にfreeze
- `registeredAt <= decisionCheckpointAtRegistration`
- frozen checkpointがcase DBの現在checkpointと一致

historical caseを後からprospectiveへラベル変更しても、checkpoint照合でholdoutにはならない。

provenance欠落は `legacy_untracked` とし、prospective holdout eligibilityはfalse。

## 5. Pre-outcome research snapshot

`src/idiosyncratic-shock-research-snapshot-contract.ts`

SHA256対象:

- case facts
- score
- checkpoint
- sources
- context / eligibility evidence
- reaction anchor
- case-selection provenance

realized future outcomeはhash対象外。

意味:

- outcome追加だけではresearch definition hashは変わらない
- score/source/context/selectionを変えるとhashが変わる

正式outcome datasetには `researchSnapshotSha256` を保存する。

## 6. Outcome dataset methodology

`shock-outcome-v1` は名前だけでなくmethodology object全体をruntime完全一致させる。

固定項目:

- adjusted close
- signal-session adjusted close entry
- horizon: 7 / 30 / 90 / 365 calendar days
- horizon date: target calendar day on/after最初の取引日
- benchmark-relative: stock return - benchmark return
- production threshold: 12
- shadow: score gateだけ除外
- no-signal: signalRate denominatorには残し、return統計から除外
- prospective holdout: default calibration/fittingから除外

同じ `methodVersion` のままhorizonや価格定義だけ変えることは禁止。

dataset内の全recordはdataset `generatedAt` と同一runでなければならない。

## 7. Aggregates are derived data

正式datasetの:

- `calibration`
- `calibrationByMarket`

は正本ではない。正本はrecord-level outcome。

runtime contractはrecordから `calibrateShockThresholds()` を再計算し、保存aggregateと完全一致することを要求する。

これにより:

- recordだけ更新してaggregateが古い
- market aggregateだけ都合の良い値へ変更
- missing market aggregate

を拒否する。

## 8. Outcome snapshot binding

`src/idiosyncratic-shock-outcome-snapshot-audit.ts`

formal outcome datasetが存在する場合、現在のcase/context/selectionからresearch snapshotを再計算する。

```text
dataset.researchSnapshotSha256
==
currentResearchSnapshot.aggregateSha256
```

でなければfail。

したがってresearch definition変更後に古いoutcome datasetをそのまま使えない。

formal outcome datasetがまだ存在しない現在は `not_applicable`。

## 9. Retrospective temporal validation

retrospective research pool内でchronological train / later validation sliceを作る。

これは:

- temporal robustness
- regime driftへの初期耐性

を見るためには有効。

ただし **prospective holdoutではない**。

retrospective chronological validationだけでlocal thresholdを `validated` にしない。

## 10. Prospective holdout

local threshold / weights候補をretrospective researchで固定した後、outcome観測前に登録したcaseだけで独立確認する。

最低条件:

- `prospective_pre_outcome`
- usable 3m outcome >= 8 at target model level

prospective outcomeはdefault `calibrateShockThresholds()` から除外する。

- default scope: `research`
- explicit evaluation: `scope: prospective`
- `scope: all` はdescriptive用途だけ

prospective結果をthreshold fittingへ戻さない。

## 11. Local registry evidence binding

正本:

```text
config/idiosyncratic-shock-calibration.yml
```

registry entryには:

- `trainFrom / trainThrough`
- `validationFrom / validationThrough`
- `trainCases`
- `validationCases`
- `validationDesign: prospective_pre_outcome`
- `benchmarkMetric: calibrationSignalBenchmarkRelative3m`

を要求する。

runtimeではさらに:

- retrospective researchは宣言train期間内だけ使用
- prospective holdoutは宣言validation期間内だけ使用
- actual train-window outcomes >= registry `trainCases`
- actual validation-window prospective outcomes >= registry `validationCases`
- scoped readinessがvalidated

を要求する。

例:

- 2024–2025 validation registryを2030年の成功例で後から満たす → BLOCK
- registryが10件と主張、実際は8件 → BLOCK
- 2018–2023 train registryを2030年追加のretrospective caseで後から満たす → BLOCK

registry evidence不一致時はlocal thresholdを使わず、検証済み親またはglobal threshold=12へ縮退する。

## 12. Matched negative controls

「企業固有shockのルールが効いた」のか「単に大幅下落株が反発した」のかを分離する。

future returnをmatching inputに使わない。

- same market
- same sector
- same reaction date
- similar raw drawdown
- similar benchmark-relative drawdown
- known shockを除外
- material corporate eventを除外
- abnormal liquidityを除外

## 13. Threshold変更gate

最低でも:

- below-12 replay-ready shadow controls >= 8
- score10–11 >= 4
- score8–9 >= 2
- distinct categories >= 3
- JP >= 2
- US >= 2
- usable shadow 3m outcomes >= 8
- retrospective temporal robustness
- local model昇格時はprospective holdout >= 8

を要求する。

件数を満たすためconfirmed BLOCKをPASSへ変えない。

## Current state — 2026-07-31

- Production threshold: **12維持**
- formal `data/idiosyncratic_shock_outcomes.json`: **未生成**
- validated local registry: **空**
- prospective holdout: **未充足**
- below-threshold explicit shadow PASS: **Ootoya 2019 (11/20) のみ**
- researched below-threshold BLOCK: Papa John's / CBS / Super Retail / Wynn / KADOKAWA / Sukiya / Activision Blizzard / Kobayashi Pharma
- strategy profitability: **未証明**
- threshold=12 optimality: **未証明**

## CI

`.github/workflows/shock-contracts.yml` が上記契約の軽量検査を担当する。

ただし現在のGitHub Actionsはjob生成後、checkout以前に `steps=null / logs=null` で停止しているため、code/test greenとは扱わない。

Actionsまたは別の実行可能環境でtypecheck/tests/auditsの実行証跡が取れるまでPRはDraftを維持する。
