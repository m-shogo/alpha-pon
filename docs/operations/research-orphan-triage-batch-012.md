# Research Orphan Human Review — Batch 012 (proposal-only independent ResearchItems)

Status: `AI_PROPOSAL_ONLY_NOT_CANONICAL`
Base main: `64fac366ede1a90b4485b55395dc65558ebe68a8`
Canonical triage authority: `research/orphan_triage/decisions.jsonl`
Canonical decisions written by this batch: **0**

## Purpose

Preserve six unresolved but semantically independent market/event research questions as `research_item_candidate` proposals instead of prematurely creating Formal Edges.

Every source in this batch explicitly identifies itself as shadow research / a research candidate and denies production authority. Each has a distinct state variable or information-ordering question, while requiring future PIT-safe samples, controls, execution realism and holdout validation.

A proposal is valid only while the listed source blob SHA matches. At actual human review time, use the current `candidateKey + candidateFingerprint` from `pnpm research:orphans --json`.

## Batch 012

| # | Candidate key | Source blob SHA | AI proposal | Independent research identity | Why it remains ResearchItem-stage |
| --- | --- | --- | --- | --- | --- |
| 1 | `unregistered_asset:document:docs/research/overnight-disclosure-gap-edge.md` | `891e6ff24ab8ce29fe876dd42702c6b82dc3ab46` | `research_item_candidate` | Overnight Disclosure Gap | Tests whether after-close/late-Friday/pre-open disclosure timing adds executable continuation/reversal information beyond event content. Source says likely a conditioning variable, not a standalone main Edge; PIT validator is the first priority. |
| 2 | `unregistered_asset:document:docs/research/regulator-first-disclosure-lag-edge.md` | `eb83d22699c4cfc1666b4605c8277748bdbd2a8a` | `research_item_candidate` | Regulator-First Disclosure Lag | Tests authority-publication → company-acknowledgement ordering and latency. It is explicitly narrower than generic Cross-Source Reveal and still needs realistic access latency, costs and untouched holdout. |
| 3 | `unregistered_asset:document:docs/research/filing-deadline-extension-escalation-edge.md` | `5e2450f9cba0452ccb8ae7ddb703af31490890e5` | `research_item_candidate` | Filing Deadline Extension Escalation | Studies a legal/statutory filing-cliff ladder: extension request/approval, deadline proximity, inability-to-file, supervision and eventual filing package. Source says `RESEARCH CANDIDATE`, not a trading signal. |
| 4 | `unregistered_asset:document:docs/research/regulatory-clock-slippage-edge.md` | `9baa1c8ead6101d1bb3c536281603d7f8d3b7332` | `research_item_candidate` | Regulatory Clock Slippage | Studies explicit delay/slippage in exchange-mandated remediation follow-up, not the filing deadline itself. It explicitly rejects the false signal that six-month anniversary without publication equals breach. |
| 5 | `unregistered_asset:document:docs/research/special-attention-anniversary-cliff-edge.md` | `eddb7dce050684787da0db5bb85a645a3b93019d` | `research_item_candidate` | Special-Attention Anniversary Cliff | Isolates the approximately one-year Special Attention internal-control review hazard/removal/delisting window from the broader Exchange Sanction Ladder. Small completed-sample count and execution risk remain unresolved. |
| 6 | `unregistered_asset:document:docs/research/oath-violation-reexamination-edge.md` | `17b80ecc91ebeb9bd82a66ec955df37996bd42f9` | `research_item_candidate` | Oath-Violation Reexamination | Isolates the one-year reexamination grace-period state machine after listing/market-transfer oath violation. The source itself calls it a high-value research candidate while emphasizing very small modern sample and alternative-delisting-path contamination. |

## Why these are not `new_edge_candidate`

A Formal Edge would claim a much stronger research authority than these sources support. Across the six sources, the following remain unresolved:

- sample size / historical backfill;
- PIT timestamp completeness;
- first executable price;
- liquidity, gap, spread and borrow costs;
- generic distress and momentum controls;
- concurrent event contamination;
- incremental value beyond adjacent research;
- untouched temporal/issuer holdouts;
- dependence on a few distressed microcaps or special cases.

A filename ending in `-edge.md` is historical prose, not permission to create a Formal Edge.

## Distinct-boundary checks

### Filing Deadline Extension vs Regulatory Clock Slippage

These are not treated as duplicates.

- Filing Deadline Extension: statutory securities-report filing deadline and its extension/escalation cliff.
- Regulatory Clock Slippage: improvement-status/remediation follow-up timing and explicit slippage after an improvement report.

The latter explicitly uses filing-extension state only as a compound-warning feature.

### Special Attention Anniversary vs Oath-Violation Reexamination

These also remain separate research questions.

- Special Attention: internal-control improvement review after Special Attention designation.
- Oath-Violation: new-listing-standard-equivalent reexamination after a written-oath violation.

Both have approximately one-year clocks but different legal/exchange states, eligibility criteria and terminal paths. Calendar duration alone is not semantic identity.

### Overnight Disclosure Gap vs Regulator-First Disclosure Lag

These remain separate.

- Overnight Disclosure Gap: market-session timing bucket and executable gap formation.
- Regulator-First Disclosure Lag: which official source published first and how long company acknowledgement lagged.

An event can be regulator-first without being overnight, and overnight without regulator-first ordering.

## Existing identity check

Before staging this batch, current canonical ResearchItem examples remained `exchange-sanction-ladder` and `kioxia-post-ipo-rerating`, while the Formal Edge Registry contained Ex-Rights Overreaction Recovery, deprecated Known-Bad Event Repricing and Misconduct Overreaction Recovery. None of the six exact identities above currently exists as a canonical ResearchItem or Formal Edge.

This is only an exact-identity duplication check, not semantic proof that no future consolidation is desirable.

## Human review contract

For each candidate, a human reviewer should decide whether the question deserves durable ResearchItem identity or should instead be represented as a Component/subsignal inside another research line.

If accepted as a ResearchItem, later relations may connect it to shared Components such as PIT execution guards and event-calendar fixtures. Acceptance still does not create a Formal Edge or authorize Promotion Gate work.

## Explicit non-actions

- no canonical ledger append
- no AI-authored `human_review`
- no ResearchItem persistence
- no Edge creation/promotion
- no Component / Study / Case persistence
- no Asset registration
- no Relation creation
- no duplicate merge
- no orphan resolution
- no BUY/SELL / Learning / notification / backtest / runtime changes

## Next safe direction

Review remediation and audit subfamilies separately. Those families contain stronger semantic overlap and predecessor/successor relationships, so they should not be bulk-classified until the parent/subsignal/duplicate boundaries are explicit.
