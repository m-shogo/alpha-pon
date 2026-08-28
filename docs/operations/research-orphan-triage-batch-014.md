# Research Orphan Human Review — Batch 014 (remediation-clock lineage proposals)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `059637969161af1ecc3f853ae9122ab0f7dfca24`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Separate the semantic Remediation Clock research question from the research logs that document how the idea was refined.

A research log is not automatically a ResearchItem or Study. This batch preserves three different roles:

1. the durable unresolved research question;
2. a historical log that explicitly advances an already-existing ResearchItem;
3. a reusable timing-window calibration that constrains future studies.

No log is promoted to Formal Edge authority and no embedded niche hypothesis is split out automatically.

A proposal remains valid only while the listed source blob SHA matches. At actual human review time, resolve the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 014

| # | Candidate key | Source blob SHA | AI proposal | Suggested subtype / target | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/remediation-clock-surprise-edge.md` | `e42cd2790db6e5775ae6c7668d428c8310ff7bc1` | `research_item_candidate` | Remediation Clock Surprise | The document defines a durable unresolved question about predictable follow-up timing versus genuinely new remediation evidence. It explicitly concludes `RESEARCH CANDIDATE, not a trading signal`, requires additional independent follow-up events, PIT-safe content features, cost controls and untouched holdout validation, and says calendar alone should have no alpha. A filename ending in `-edge.md` therefore does not justify `new_edge_candidate`. |
| 2 | `unregistered_asset:document:docs/research/logs/2026-08-03-1049-jpx-remediation-clock.md` | `07c069cf55caba69f269bccf162213c3e35d8736` | `existing_research_link_missing` | `research_item:exchange-sanction-ladder` | The log's stated objective is to **advance the Exchange Sanction Ladder** by investigating its calendarable remediation follow-up state. Its current assessment is a `PROMISING DATA-SCHEDULING FEATURE`, explicitly not a standalone production Edge. The canonical Catalog already contains `research_item:exchange-sanction-ladder`; this log is better treated as provenance/supporting documentation than as another ResearchItem. |
| 3 | `unregistered_asset:document:docs/research/logs/2026-08-04-0347-remediation-clock-window-calibration.md` | `c8da70b502a9616fa628078e2843f5b3d53ddec8` | `component_candidate` | `calibration` | The durable contribution is an expected-window calibration: replace a naive exact-six-month assumption with six-calendar-month anchor, business-day-aware plausible window, publication-window state and PIT-safe slippage rules. The document explicitly prohibits exact-date pre-positioning and says the sample of three completed pairs is too small to infer a stable distribution. This is a reusable calibration boundary, not a completed Study result or Formal Edge. |

## Why Remediation Clock Surprise is a ResearchItem, not a new Edge

The source itself establishes several fail-closed boundaries:

- production use is prohibited until validated;
- the calendar alone is expected to have no alpha;
- return attribution must remove generic distress and concurrent events;
- publication timestamps must align to first executable sessions;
- content scoring must be reproducible without hindsight;
- liquidity, spread and borrow costs remain unresolved;
- an untouched holdout must pass;
- incremental value beyond Exchange Sanction Ladder and Remediation Specificity Gap is unproven.

The durable ontology object at this stage is therefore the question/mechanism, not trading authority.

## Why the 2026-08-03 log is not another ResearchItem

The log explicitly begins from an existing research identity and records one research run's findings. It introduces two working hypotheses, but its own conclusion is that the useful output is a partly predictable **research calendar** and that additional historical backfill is required.

Creating a second ResearchItem from the log would split provenance from the research identity and risk double-counting the same remediation-clock idea.

If a human accepts this classification, the later persistence action should first register the document Asset and then consider a `documents` relation to `research_item:exchange-sanction-ladder`. This proposal does not perform either action.

## Why the 2026-08-04 log is calibration, not Study

The log includes three observed report pairs, but explicitly says the sample is too small to infer a stable distribution. Its principal output is a reusable rule for how future studies should define and pre-register the expected publication window.

That is different from claiming one bounded empirical Study has produced a result. A future Study can depend on this calibration while maintaining a separate sample manifest, execution cutoff and StudyResult lineage.

The embedded `Remediation Window Overrun Escalation` niche hypothesis is intentionally **not** separately classified here. The log says it is not yet an Edge and may merely proxy for distress, disclosure weakness or illiquidity. Splitting it out now would turn one calibration note into multiple premature research identities.

## Relation to prior batches

This batch is consistent with prior decisions to:

- keep Exchange Sanction Ladder as an existing Catalog ResearchItem;
- treat `cohort`, `calibration`, `guard`, `filter` and `fixture` as reusable non-Edge component roles;
- preserve early semantic questions as ResearchItem candidates rather than proliferating Formal Edges;
- keep empirical Study execution separate from parent research identity;
- avoid classifying files from names alone.

## Human review contract

For candidate 1, a human reviewer should decide whether Remediation Clock Surprise deserves its own ResearchItem, should instead become a component/subquestion of Exchange Sanction Ladder, or should be merged with another remediation research line.

For candidate 2, a human reviewer should confirm that the log documents Exchange Sanction Ladder rather than a different canonical target.

For candidate 3, a human reviewer should decide whether the expected-window rule deserves stable `ResearchComponent(kind=calibration)` identity or should remain supporting documentation attached to the future Remediation Clock ResearchItem.

None of these proposal outcomes authorizes persistence by itself.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchItem persistence
- no ResearchComponent persistence
- no Study / StudyResult / SampleManifest creation
- no Asset registration
- no Relation creation
- no duplicate merge
- no orphan resolution
- no new Formal Edge registration or promotion
- no BUY/SELL / Edge Gate / Learning / notification / backtest / runtime changes

## Next safe direction

Continue with the remaining root-level research documents only after subtracting every candidate already covered by Batches 001–014 and every document already represented by an Asset/Relation. Prefer small semantic clusters rather than a mass classification pass.
