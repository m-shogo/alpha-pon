# Research Orphan Human Review — Batch 013 (proposal-only ResearchItem + Study design)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `51c13da253e58af87c363750b3c5d67ac311f48e`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Keep the **research identity** separate from the **specific validation design** for Subsidiary Concentration × Audit-Evidence Escalation.

This split prevents a one-case discovery seed from being mistaken for a validated Edge or for a completed Study. The canonical ResearchStudy schema explicitly permits a `draft` study and a `confirmatory` mode, so a falsifiable future design can be preserved without claiming that the design has been executed.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 013

| # | Candidate key | Source blob SHA | AI proposal | Suggested semantic role | Rationale |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/subsidiary-concentration-audit-evidence-escalation-edge.md` | `9152ed0385b11d5ea325d7e9273e86aeef3c7136` | `research_item_candidate` | ResearchItem: Subsidiary Concentration × Audit-Evidence Escalation | The source defines an independent unresolved interaction question: `subsidiary economic concentration × audit-evidence failure × weak parent oversight`. It explicitly says `RESEARCH CANDIDATE`, not a trading signal, and requires cross-issuer validation, PIT-safe concentration data, execution realism and untouched holdout before any promotion. |
| 2 | `unregistered_asset:document:docs/research/subsidiary-concentration-audit-evidence-validation-contract.md` | `90502350776b77e09e6d529b11178ba6c515bb55` | `study_candidate` | `ResearchStudy(mode=confirmatory, status=draft)` | This is a concrete validation design for the parent question: one issuer-event unit of analysis, PIT eligibility, four mandatory comparison cohorts, frozen primary/diagnostic outcome windows, baseline/main-effect/interaction model comparisons, execution-cost guard, leakage/duplication guards, and untouched holdout. It is a Study design, not a Study result. |

## Existing seed evidence does not make this a completed Study

The existing seed file `data/research/subsidiary-concentration-audit-evidence-seed-2026-08-02.json` currently declares:

- `status: SHADOW_RESEARCH_ONLY`;
- `productionUse: false`;
- one confirmed positive seed: REVOLUTION (8894);
- `researchUse: positive_seed_only_not_outcome_label`;
- KDDI and nms Holdings remain non-qualifying until concentration/evidence data are established;
- eMnet Japan remains discovery-only;
- a hard guard explicitly says `Do not promote based on REVOLUTION alone.`

Therefore:

- sample count is not treated as validation;
- no result is inferred;
- no holdout has been opened;
- no Net Alpha is claimed;
- no Edge authority is created.

## Why the parent is a ResearchItem, not `new_edge_candidate`

The source's filename contains `edge`, but the semantic state is earlier than Formal Edge authority. The unresolved requirements include:

- enough independent cases across sectors;
- point-in-time reproducible subsidiary concentration data;
- evidence that concentration adds information beyond audit-opinion severity and generic distress;
- realistic next-open entry and short-cost treatment;
- no single issuer dominance;
- untouched holdout success.

ResearchItem preserves the durable question without inventing Gate/sample/confidence results.

## Why the validation contract is a Study, not a Component

A reusable Component is a non-Edge building block such as a filter, cohort, calibration, guard or fixture. This validation contract goes further: it defines a bounded empirical design around one parent question.

It specifies:

1. unit of analysis;
2. eligibility rules;
3. treatment/interaction labels;
4. four comparison cohorts;
5. matching dimensions;
6. frozen primary and diagnostic outcome windows;
7. baseline vs main-effect vs interaction model comparisons;
8. execution/net-alpha policy;
9. leakage/duplication rejection rules;
10. development and untouched holdout split requirements.

Those fields map naturally to a draft confirmatory ResearchStudy. The proposal does **not** mean the Study is registered, running or completed.

## REVOLUTION boundary

REVOLUTION is already represented by the existing Case `revolution-8894-special-attention-2026-07` and its document Relation. Do not create another Case from this research line.

For this proposed Study, REVOLUTION is a **discovery seed only** and must never become the untouched holdout. A later Study manifest must keep the discovery/development/holdout boundaries explicit.

## Human review contract

A human reviewer should decide:

1. whether the interaction question deserves a durable ResearchItem identity;
2. whether the validation contract is sufficiently specific to deserve a draft confirmatory Study identity;
3. what exact relation should connect the Study to the parent ResearchItem if both are accepted;
4. whether any validation-control fragments should later be extracted into reusable Components;
5. how to preserve the existing seed JSON as evidence/input without treating it as StudyResult authority.

Acceptance of either triage proposal still does not create Catalog objects, Study manifests, results or Relations.

## Explicit non-actions

- no canonical triage ledger append
- no AI-authored `human_review`
- no ResearchItem persistence
- no ResearchStudy persistence
- no StudySampleManifest or StudyResult creation
- no Case creation
- no Formal Edge creation/promotion
- no Asset registration
- no Relation creation
- no backtest or sample expansion
- no fabricated controls/outcomes
- no BUY/SELL / Learning / notification / runtime changes

## Next safe direction

Review the remediation family as a separate semantic cluster:

- broad post-remediation residual hazard (`Remediation Half-Life`);
- later failure as credibility-revision event (`Remediation Failure Recurrence`);
- six-month follow-up content surprise (`Remediation Clock Surprise`);
- remediation-owner/control-function turnover as a likely reusable `subsignal` Component (`Remediation Team Attrition`).

Do not collapse those four solely because they share the word `remediation`.
