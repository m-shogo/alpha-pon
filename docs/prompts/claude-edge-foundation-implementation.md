# Claude Prompt — Alpha Pon Edge Research Foundation

あなたは `m-shogo/alpha-pon` 専用の実装エージェントです。ほかのrepo・projectには触れないでください。

## 目的

2026-08-04までに、Alpha Ponを単なる毎時監視ではなく、継続的にEdgeを発見・反証・検証し、Gitで研究状態を引き継げる基盤へ進化させてください。

最新mainを取得し、最初に必ず以下を確認してください。

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/roadmaps/edge-research-automation-roadmap-2026-08-04.md`
- 現在のmarket event/calendar実装
- `docs/research/` 以下の既存Edge資料
- 現在のschemas、scripts、reports、tests、workflows
- 直近コミットと未完作業

既存のカレンダー実装は壊さず、研究基盤と共有する契約だけを明確化してください。カレンダー作業とEdge研究を1つの処理や1つの可変ファイルに混ぜないでください。

## 最重要方針

1. 会社IR、TDnet、JPX、EDINET、公的資料、主要報道、Historical DB、PIT snapshot、市場データを正本とする。
2. SNS、掲示板、インフルエンサー、匿名投稿、SNS sentimentは一切使用しない。
3. 新しいEdgeはすべてshadow-only。実績を捏造せず、未検証のproduction昇格をしない。
4. Heavy scan、archive join、backtestはMac self-hosted runnerへ委譲できる契約にする。
5. GitHub-hosted CIだけで大容量ローカルDBが存在すると仮定しない。
6. Point-in-time safety、future leakage、confounder、execution cost、liquidity、borrow cost、holdoutを必須にする。
7. 同じ調査を毎時繰り返さず、checkpointと`next_best_action`から再開できるようにする。
8. narrative documentを増やすだけで終わらせず、machine-readable registry、queue、checkpoint、experiment contractを優先する。

## 実装順

### Phase A: Authority discovery

- 現在の正本を特定する。
- 競合する正本を作らない。
- 不明瞭なら `docs/research/edge-research-authority.md` を追加する。
- misconduct event、market event、Edge registry、experiment result、hourly checkpoint、Named Watch stateのownerを明記する。

### Phase B: Edge Registry v1

machine-readable Edge Registryを実装してください。

最低限のfields:

- `edge_id`, `name`, `family`, `status`, `priority`
- `structural_thesis`, `causal_mechanism`
- `event_types`, `universe`, `direction`
- `entry_candidates`, `exit_windows`
- `required_data`, `pit_requirements`
- `confounders`, `falsification_conditions`
- `execution_constraints`, `hard_blockers`
- `sample_count`, `train_status`, `holdout_status`
- `gross_alpha`, `net_alpha`, `confidence`
- `last_advanced_at`, `next_best_action`
- `source_policy`, `sns_used=false`

seed対象:

- Known-Bad Event Repricing
- Exchange Sanction Ladder
- Remediation Half-Life
- Regulatory Clock Slippage
- Improvement-Status Clock
- Audit Opinion State Transition
- Kioxia-type Corporate Structure
- Starlink-type Future Demand

候補path:

- `data/edge-registry/edges.json`
- schema
- validator
- tests

duplicate ID、不正なstatus遷移、falsification欠落、`sns_used!=false`をrejectしてください。

### Phase C: Hourly checkpoint

各runの研究状態を残してください。

必要fields:

- run timestamp
- source PIT cutoff
- previous checkpoint
- P0 scan result
- advanced edge
- completed work
- evidence/source types
- explored candidate or duplicate/rejection reason
- missing data
- next best action
- notification decision/reason
- commit/job reference
- `sns_used=false`

候補path:

- `reports/hourly-research/latest.json`
- dated history or append-only ledger
- validator

future timestampやcheckpoint逆行をrejectしてください。

### Phase D: Event Study Contract

全event-driven Edgeで共通利用できるinput/output contractを実装してください。

window:

- prior close -> next open
- D0 open -> close
- D0 close-to-close
- D+1, D+3, D+5
- optional D+10, D+20

controls:

- TOPIX
- sector benchmark
- beta-adjusted or matched-control return
- volume shock
- gap/spread proxy
- concurrent earnings/guidance/capital action/index/block trade/macro flags
- liquidity
- borrow availability/cost
- reverse-stock-loan constraints

fixtureとtestsを追加し、架空のproduction performanceは書かないでください。

### Phase E: Value-of-Information Queue

research slicesを順位付けするqueueを実装してください。

score要素:

- P0 urgency
- new primary evidence
- missing sample value
- expected information gain
- closeness to promotion/falsification
- data availability
- execution cost
- duplication risk
- time since last advance

要件:

- deterministic ordering
- starvation prevention
- 1 Edgeが設定回数以上連続占有しない
- Named Watchとtrainingを分離
- duplicate candidateはmerge/reject
- heavy workはrunner jobへ変換

queue JSON reportとtestsを追加してください。

### Phase F: Runner contracts

以下のworkflow契約を用意してください。

1. `edge-hourly-light`
   - schemas/validators
   - small-source scan
   - queue generation
   - checkpoint validation
2. `edge-research-heavy`
   - archive scan
   - Historical Analog backfill
   - market joins
   - event studies
   - holdout experiments
3. `edge-daily-integrity`
   - duplicate events
   - PIT leakage
   - source freshness
   - registry/report consistency
   - edge decay

workflowはresumableにし、narrativeより先にmachine-readable artifactを残してください。

### Phase G: Operations docs

作成:

- `docs/operations/edge-hourly-runbook.md`
- `docs/operations/self-hosted-runner-handoff.md`

runbookには毎時1サイクルの順序を固定してください。

1. bounded P0 scan
2. checkpoint/queue read
3. highest-value evidence taskを1つ前進
4. candidateを1つ探索してregister/merge/reject
5. PIT/confounder/cost/holdout監査
6. registry/checkpoint/reportを保存
7. materialな時だけ通知

## 完成条件

最低限すべて満たしてください。

- authority document
- registry schema + seeded registry + validators/tests
- hourly checkpoint format + latest checkpoint
- event-study contract + fixtures/tests
- deterministic research queue + starvation tests
- light/heavy/daily workflow contracts
- operations docs
- calendar側の既存checksがgreen
- Edgeのfalse promotionなし
- SNS非使用auditあり

全部を完成できない場合、優先順位は次です。

1. authority
2. registry
3. checkpoint
4. event-study contract
5. queue
6. runner workflows
7. docs

UI追加は不要です。

## 作業方法

- 小さく意図の明確なcommitに分ける。
- 各Phase後に関連testsを実行する。
- 既存のユーザー変更を上書きしない。
- 大規模renameや無関係なrefactorを避ける。
- blockerが外部credential、runner登録、大容量ローカルDBだけなら、そこまで実装して正確なhandoffを残す。
- 最後に、実装済み、未完、checks、commit一覧、次の1手を報告する。

開始してください。