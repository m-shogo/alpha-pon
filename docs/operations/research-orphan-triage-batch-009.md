# Research Orphan Human Review — Batch 009 (proposal-only historical analog Cases)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `b9cb93382e3ae13deb2d0bee0b568ac8086183da`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Classify two issuer-specific historical analog notes without converting their embedded hypotheses into standalone Edges or treating the notes themselves as completed Studies.

The Research Knowledge architecture defines Case as a bounded real-world episode, not an issuer identity and not an Edge. These two sources are organized around specific issuer misconduct/remediation episodes, official chronologies, bounded failure modes, research implications and falsification/backfill requirements. Their durable semantic value is therefore the episode/analog, while the candidate mechanisms inside them remain hypotheses for other ResearchItems/Edges.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 009

| # | Candidate key | Source blob SHA | AI proposal | Proposed Case boundary | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/historical-analogs/emnet-japan-7036-executive-control-override.md` | `0270812ebf16962ef94417d434159b3265ef0a53` | `case_candidate` | eMnet Japan (7036), 2026 executive-control override / correction / JPX remediation episode | The source explicitly calls itself a historical analog seed, gives a bounded official chronology, decomposes actor separability and corporate contagion, records the current remediation state and says the case is not yet a trading signal. Candidate Edge ideas inside the note are research implications of the episode, not permission to create multiple Edges. |
| 2 | `unregistered_asset:document:docs/research/historical-analogs/tokyo-koki-7719-repeat-remediation-failure.md` | `4235dfa59ed8e379881cc64872b5f5c01d441139` | `case_candidate` | Tokyo Koki (7719), 2017–2024 repeat-remediation / Special Attention episode spanning two documented cycles | The source explicitly says `HISTORICAL_ANALOG_SEED` and `USEFUL HISTORICAL ANALOG, not a signal`. It records two bounded misconduct/remediation cycles and why the later JPX decision makes prior-remediation failure a useful feature. The episode should remain distinct from the broader recurrence hypothesis. |

## Existing Case duplication check

Before staging this proposal, current `research/knowledge_catalog/cases/` was checked. It contains only:

- `kioxia-285a-post-ipo-rerating-case`
- `revolution-8894-special-attention-2026-07`

No eMnet Japan or Tokyo Koki Case identity is currently present. This does not authorize automatic Case creation; it only removes an obvious exact-identity duplicate from the proposal set.

## Why these are Cases, not `new_edge_candidate`

Both notes explicitly deny signal/production authority. Their structure is issuer/event-centric:

- official chronology;
- failure/remediation state;
- actor/control interpretation;
- bounded episode-specific facts;
- future backfill and falsification requirements.

The embedded hypotheses (executive-removal overconfidence, remediation specificity, prior-remediation failure fingerprint, exchange-stage effects) may later belong to ResearchItems, Components or existing Edges. Creating an Edge from each idea here would duplicate evidence and fragment one real-world episode into multiple artificial research identities.

## Why these are not `study_candidate`

Neither note represents one frozen empirical Study execution with a defined sample manifest and result lineage. Each is one real-world analog used to motivate future cross-issuer testing. The future matched-control/event-window designs belong in a Study only when actually specified/executed as a bounded run.

## Human review contract

A human reviewer should decide whether each episode deserves stable Case identity and, if so, its exact episode boundary. Human review should also confirm that:

1. the Case is not merely issuer memory;
2. the episode boundary does not silently combine unrelated misconduct cycles;
3. links to ResearchItems/Edges are created only after the target identity is explicit;
4. no embedded candidate hypothesis is promoted merely because the Case is accepted.

If a human accepts `case_candidate`, that triage decision still does **not** create a Case or Relation.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no Case persistence
- no ResearchItem / ResearchComponent / Study / Edge creation
- no Asset registration
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Deferred logs

The two Markdown files under `docs/research/logs/` are intentionally excluded from this batch. They contain real research content, but their durable identity is less clear: they may be supporting documents for existing research, calibration/component evidence, or research-history logs that should not become semantic nodes. They require a separate review rather than being forced into Case or Study classification.
