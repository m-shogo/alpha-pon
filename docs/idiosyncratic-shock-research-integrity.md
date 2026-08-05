# 企業固有ショック — Research Integrity Chain

## 目的

企業固有ショック研究で「結果を見てから研究条件を変える」「retrospective事例をprospective OOSと呼ぶ」「古い集計を新しい定義へ使い回す」といった研究上の抜け道を防ぐための正本。

Production thresholdは現在 **12/20**。この契約を満たしても、それだけでthreshold変更や戦略収益性を証明したことにはならない。

## Integrity chain

```text
outcome-blind candidate freeze
  ↓
research-state registry
  ↓
historical case facts / PIT score
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

後段の結果を前段へ逆流させない。前段が変わった場合は依存する後段を再生成・再検証する。

## 1. Outcome-blind candidate freeze

threshold境界事例を結果を知った後で都合よく選ばないため、候補は採点前にfreezeする。

正本:

```text
data/idiosyncratic_shock_threshold_candidate_backlog.yml
data/idiosyncratic_shock_threshold_candidate_backlog_expansion_*.yml
```

候補selectionで許可するのは構造情報だけ。

- market / jurisdiction不足
- category不足
- event structure
- primary-source availability

候補freezeへ入れてはいけないもの:

- score / scoreVector
- future return
- recovery pattern
- realized outcome
- post-event price path

### Freezeと進捗を分離

batch3以降のexpansion freezeは `researchState=unscored` のまま変更禁止。

研究進捗の正本:

```text
data/idiosyncratic_shock_threshold_candidate_research_state.yml
```

state registryが保持できるのはlifecycle metadataのみ。

- `researchState`
- `decidedAt`
- `notes`

score / return / outcome等をstate registryへ入れることも禁止する。

runtime default loaderはfreeze recordへstate registryをoverlayする。expansion freeze自体を`promoted`へ直接書き換えた場合はfailする。

batch1–2のbase backlogは分離導入前のlegacy stateを含むが、現在のruntime progress正本はstate registry。batch3以降はimmutable freeze方式を必須とする。

## 2. Outcome-blind batch実績

2026-07-31時点で **23候補を採点前freeze後にPIT研究**した。

| case | PIT score | classification |
|---|---:|---|
| Benesse 2014 | 9 | shadow BLOCK |
| Dentsu 2016 | 8 | shadow BLOCK |
| Chipotle 2015 | 7 | shadow BLOCK / band外 |
| Guess 2018 | 12 | production-threshold side |
| Starbucks 2018 | 11 | shadow BLOCK |
| Recruit 2019 | 11 | shadow BLOCK |
| JAL 2018 | 9 | shadow BLOCK |
| Kobe Steel 2017 | 8 | shadow BLOCK |
| Tesla 2018 | 9 | shadow BLOCK |
| Equifax 2017 | 5 | shadow BLOCK / band外 |
| Wells Fargo 2016 | 5 | shadow BLOCK / band外 |
| Snow Peak 2022 | 12 | production-threshold side |
| SUBARU 2017 | 8 | shadow BLOCK |
| lululemon 2018 | 14 | production-threshold side |
| Barnes & Noble 2018 | 13 | production-threshold side |
| ENEOS 2022 | 14 | production structural PASS side |
| Japan Post Insurance 2019 | 4 | systemic BLOCK / band外 |
| Intel 2018 | 14 | **high-score hard BLOCK: ongoing investigation** |
| McDonald's 2019 | 15 | production structural PASS side |
| Nissan 2018 | 5 | accounting / investigation hard BLOCK |
| Mitsubishi Motors 2016 | 4 | open investigation / band外 |
| HP 2010 | 14 | production structural PASS side |
| Facebook 2018 | 6 | platform privacy open-investigation BLOCK |

この分布はbacklogが「8–11点のPASSを作るリスト」ではないことを示す。4/5/6/7点や12–15点になった候補もそのまま受け入れる。

特にIntel 2018は14点でも同日一次情報が`ongoing investigation`を明示するためBLOCK。scoreとhard gateを混同しない。

Recruit 2019は一度shadow PASS候補になったが、2019-08-26のPPC一次資料自体に調査継続が明記されていたためPIT再監査でBLOCKへ訂正した。未来資料で結論を変えたのではなく、checkpoint時点で既に公開されていたhard blockerを復元した訂正。

McDonald's 2019では2020年に判明した追加事実を2019-11-04 checkpointへ逆流させない。ENEOS 2022でも2023年以降の別事案を2022 recurrence評価へ逆流させない。Facebook 2018でも2019年のFTC/SEC settlementを2018-03-19へ逆流させない。Nissan/Mitsubishi Motorsも後日の起訴・最終調査報告・提携や回復結果をcheckpointへ入れない。

active backlogが0かつthreshold readiness未達なら `replenishmentRequired=true`。queue exhaustionをresearch completionと解釈しない。

## 3. PIT evidence

Historical case source:

- `publishedAt` があるsourceは `publishedAt <= decisionCheckpoint` の場合だけeligibilityに使用。
- checkpoint後sourceを過去PASS/BLOCKの根拠へ逆流させない。
- legacy undated sourceは技術負債として別auditで可視化。

Sidecar eligibility evidence:

- valid `publishedAt` 必須
- `publishedAt <= decisionCheckpoint` 必須
- future / undatedはfail-closed

Productionとthreshold-calibration shadowは同じPIT source gateを使う。

## 4. Production / threshold-calibration separation

### Production

`strategyEligibilityAtCheckpoint`

- score >= 12を含む現行運用parity
- score < 12はBLOCK

### Threshold calibration

`calibrationEligibilityAtCheckpoint`

- score gateだけを外す
- accounting / macro / investigation / critical license-listing risk / confounder / source / recurrence / remediation / liquidity / incident cascade等のhard gateは維持

score < 12を自動PASSにしない。逆にscore >= 12でもIntelのようにhard blockerがあればBLOCK。

現在のbelow-threshold explicit shadow PASSは:

- Ootoya 2019 — 11/20
- United Flight 3411 2017 — 10/20

のみ。両方Productionではscore gateによりBLOCK。

## 5. Reaction anchor

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

ENEOS/McDonald's/HPの`strategyEligibilityAtCheckpoint=confirmed_pass`も、reaction/価格ゲートを通過したことを意味しない。

## 6. Case-selection provenance

正本:

```text
data/idiosyncratic_shock_case_selection.yml
data/idiosyncratic_shock_case_selection_expansion_*.yml
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

historical caseを後からprospectiveへラベル変更してもholdoutにはならない。provenance欠落は `legacy_untracked` でprospective holdout=false。

batch2 / batch3 / batch4 / batch5のoutcome-blind候補はすべて `retrospective_research + known_or_available` として記録し、prospective holdoutへ偽装しない。

## 7. Pre-outcome research snapshot

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

- outcome追加だけではresearch definition hashは変わらない
- score/source/context/selectionを変えるとhashが変わる

formal outcome datasetには `researchSnapshotSha256` を保存する。

candidate research stateはlifecycle metadataであり採点内容の正本ではないためsnapshot定義には混ぜない。

## 8. Outcome dataset methodology

`shock-outcome-v1` はmethodology object全体をruntime完全一致させる。

固定:

- adjusted close
- signal-session adjusted close entry
- horizon: 7 / 30 / 90 / 365 calendar days
- horizon date: target calendar day on/after最初の取引日
- benchmark-relative: stock return - benchmark return
- production threshold: 12
- shadow: score gateだけ除外
- no-signal: signalRate denominatorには残し、return統計から除外
- prospective holdout: default calibration/fittingから除外

同じmethodVersionのままhorizonや価格定義だけ変えない。dataset内recordはdataset `generatedAt` と同一runを要求。

## 9. Aggregates are derived data

正式datasetの `calibration` / `calibrationByMarket` は正本ではない。正本はrecord-level outcome。

runtime contractはrecordから `calibrateShockThresholds()` を再計算し、保存aggregateと完全一致させる。

## 10. Outcome snapshot binding

formal outcome datasetが存在する場合:

```text
dataset.researchSnapshotSha256
==
currentResearchSnapshot.aggregateSha256
```

を要求。research definition変更後に古いoutcome datasetを使い回さない。

formal outcome datasetがまだ存在しない現在は `not_applicable`。

## 11. Retrospective temporal validation / prospective holdout

retrospective chronological splitはtemporal robustness確認には使えるが **prospective holdoutではない**。

local threshold / weights候補をretrospective研究で固定した後、outcome観測前に登録したcaseだけで独立確認する。

prospective最低条件:

- `prospective_pre_outcome`
- usable 3m outcome >= 8 at target model level

prospective outcomeはdefault fittingから除外する。

## 12. Local registry evidence binding

`config/idiosyncratic-shock-calibration.yml`

registry entryにはtrain/validation期間・件数・`validationDesign: prospective_pre_outcome`・`benchmarkMetric: calibrationSignalBenchmarkRelative3m`を要求する。

実outcome側の期間・件数・scoped readinessと一致しなければlocal thresholdを拒否し、検証済み親またはglobal threshold=12へ縮退する。

## 13. Matched negative controls

Shock固有効果と単なる大幅下落後反発を分離する。future returnをmatching inputに使わず:

- same market / sector / reaction date
- similar raw drawdown
- similar benchmark-relative drawdown
- known shock除外
- material corporate event除外
- abnormal liquidity除外

でdeterministic matchingする。

## 14. Threshold変更gate

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

を要求する。件数を満たすためconfirmed BLOCKをPASSへ変えない。

## Current state — 2026-07-31

- Production threshold: **12維持**
- outcome-blind frozen/researched candidates: **23/23**
- active candidate backlog: **0**
- next candidate replenishment: **REQUIRED (batch6)**
- below-threshold explicit shadow PASS: **Ootoya 2019 (11), United 2017 (10)**
- high-score hard-BLOCK counterexample: **Intel 2018 (14)**
- formal `data/idiosyncratic_shock_outcomes.json`: **未生成**
- validated local registry: **空**
- prospective holdout: **未充足**
- strategy profitability: **未証明**
- threshold=12 optimality: **未証明**

## CI

`.github/workflows/shock-contracts.yml` が以下を検査する。

- all loaded historical context enum validation
- case-selection expansion provenance
- candidate backlog expansion merge
- immutable expansion freeze (`researchState=unscored`)
- separate research-state registry completeness
- state registryへのscore/outcome field混入禁止
- batch1–5 actual PIT scores / hard gates
- retrospective/prospective isolation
- outcome methodology / aggregate / snapshot binding
- offline audits

GitHub Actionsの実行証跡がcheckout以前で停止している状態ではcode/test greenとは扱わない。Actionsまたは別の実行可能環境でtypecheck/tests/auditsの実行証跡が取れるまでPRはDraftを維持する。
