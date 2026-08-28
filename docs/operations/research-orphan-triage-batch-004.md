# Research Orphan Human Review — Batch 004 (proposal-only components)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `85b7f4f68ed995c0945d3dd85114db0582fa6e36`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Move beyond obvious infrastructure while still avoiding premature Edge creation.

The Research Knowledge Architecture defines `ResearchComponent` as a reusable research building block and explicitly lists `guard` and `filter` as candidate component kinds. The documents in this batch describe reusable guards/filters applied across existing research rather than standalone repeatable market Edges.

Therefore the AI proposal for each is `component_candidate`. This is not a canonical classification and does not create a ResearchComponent.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 004

| # | Candidate key | Source blob SHA | AI proposal | Suggested component kind | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/official-publication-executability-guard.md` | `5efa9cf46fbb7bc98177e18b10c77fc5829a113c` | `component_candidate` | `guard` | Applies a reusable PIT executability rule to Known-Bad Event Repricing, Exchange Sanction Ladder, Remediation Clock Surprise, and reaction-to-news research. It protects multiple research lines rather than defining one new Edge. |
| 2 | `unregistered_asset:document:docs/research/preopen-official-source-completeness-guard.md` | `b295386a45f9e568753e5f7b371f85ae9fbe50ce` | `component_candidate` | `guard` | Explicitly has status `RESEARCH_GUARD`; fail-closes absence claims before source freshness is proven and protects multiple misconduct/governance studies. |
| 3 | `unregistered_asset:document:docs/research/weekend-official-source-latency-guard.md` | `652a3d93e6a3eab2be81376d23b8c0852761465e` | `component_candidate` | `guard` | Explicitly says it is not a trading edge by itself and is a PIT/source-freshness guard for all event-driven Edges. |
| 4 | `unregistered_asset:document:docs/research/disclosure-bundle-decomposition-guard.md` | `358256f5f9d2e1c04c055fecbabfcb8170b11957` | `component_candidate` | `guard` | Requires multi-disclosure event bundles to be decomposed before several existing reaction-to-news Edges can be promoted; this is a reusable causal-attribution guard. |
| 5 | `unregistered_asset:document:docs/research/external-incident-materiality-filter.md` | `dc3d95e50b0c82c5ab188ed0025d0397d89bf913` | `component_candidate` | `filter` | The document explicitly sets `Role: FALSE_POSITIVE_FILTER` and `Main edge: NO`; it excludes external incidents that do not transfer into company responsibility/materiality. |
| 6 | `unregistered_asset:document:docs/research/sanction-economic-materiality-filter.md` | `2554c38e39e0e703fa1fc81975ab3005e09703fc` | `component_candidate` | `filter` | Explicitly describes itself as a filter for existing Exchange Sanction Ladder and Known-Bad Event Repricing research and says it is not a standalone trading signal. |

## Why these are not proposed as `infrastructure`

These documents do more than define the platform. They encode research logic reused inside market research:

- how an event timestamp becomes executable;
- how absence claims fail closed when sources are stale;
- how bundled disclosures are decomposed;
- how false-positive external incidents are excluded;
- how sanctions are normalized by economic materiality.

That makes `ResearchComponent(kind=guard|filter)` a better candidate identity than generic infrastructure **if** a human decides these rules deserve stable reusable identity.

## Why these are not proposed as `new_edge_candidate`

Each source either explicitly says it is not a standalone Edge/trading signal or operates as a constraint/filter around existing Edges. The reusable object is the research control, not a separate alpha mechanism.

No Edge is created or promoted by this batch.

## Human review contract

For each candidate, a human reviewer should decide whether:

1. it deserves stable reusable `ResearchComponent` identity;
2. it is only supporting documentation for an already existing component/research identity (`existing_research_link_missing` may then be more accurate);
3. it should instead remain infrastructure or be classified otherwise.

The AI proposal must not decide between those possibilities canonically.

If a human accepts `component_candidate`, that triage decision still does **not** create a component. Resolution remains a separate explicit Catalog action.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchComponent creation
- no ResearchItem / Study / Case / Edge creation
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Edge Gate / Learning / notification / backtest changes

## Next safe direction

After this reusable guard/filter group, inspect cohort/calibration/event-study documents separately. Those may be `study_candidate`, `component_candidate(kind=cohort|calibration)`, or existing-research link gaps and should not be mixed into this batch.
