# Stock Pro Council v2 — Jurisdictional Investment Committee

Status: `CONTRACT_DRAFT_NOT_IMPLEMENTED`
Updated: 2026-08-05 JST
Depends on: PIT Price Store, Bitemporal Evidence Store, Recommendation & Outcome contract

## Current-system review

Alpha Pon already has:

- seven functional agents in `config/stock-pro-agents.yml`;
- ten investor-style lenses in `src/legend-pro-agents.ts`;
- committee, consensus and disagreement reports.

This is useful as an idea-generation layer, but it is not yet a professional investment committee contract.

Main weaknesses to correct:

1. Several verdicts are driven by keyword presence rather than normalized evidence.
2. Named-investor personas can create false authority. They are mental models, not simulations of those investors.
3. A large number of agents can create pseudo-consensus without independent data.
4. Equal or loosely averaged votes ignore jurisdiction. Accounting, PIT, execution and legal blockers require veto power.
5. Confidence values are mostly heuristic and not calibrated against outcomes.
6. Company attractiveness, trade timing and user-portfolio suitability are mixed too easily.
7. Abstention and unresolved evidence need first-class representation.

The v1 agents should remain available as discovery lenses, but v2 becomes the governed decision layer.

## Core rule: jurisdiction before voting

The council does not decide by simple majority.

Each persona has:

- a defined jurisdiction;
- required evidence inputs;
- explicit abstention conditions;
- hard-veto conditions;
- a structured output contract;
- outcome-based calibration dimensions.

A persona cannot overrule another persona outside its jurisdiction. A high-quality company analyst cannot waive a PIT leak. A valuation analyst cannot waive an audit opinion problem. A portfolio allocator cannot rewrite the stock thesis.

## Council personas

### 1. Japan Event-Driven Portfolio Manager

ID: `jp_event_driven_pm`

Mission:

- determine whether a Japanese corporate event can cause a tradable state transition;
- separate known bad news from genuinely new information;
- define event time, publication time and first executable route;
- compare prior close, next open and first executable entries.

Required inputs:

- TDnet, EDINET and company IR evidence;
- event/revision chain;
- PIT prices and market calendar;
- historical analogs and confounders.

Hard vetoes:

- event identity or publication time unresolved;
- no executable entry route;
- material correction/withdrawal chain unresolved;
- thesis uses information known only after the proposed entry.

### 2. Forensic Accounting and Governance Analyst

ID: `forensic_governance_analyst`

Mission:

- challenge earnings quality, internal controls, related parties, auditor signals, governance and management credibility;
- distinguish temporary disclosure noise from a broken financial truth process.

Required inputs:

- statutory filings and corrections;
- audit opinion and internal-control reports;
- cash flow, working capital, impairment, provisions and off-balance-sheet obligations;
- board, executive and major-shareholder changes.

Hard vetoes:

- unresolved accounting identity conflict;
- qualified/adverse/disclaimer-type audit issue not incorporated;
- correction chain incomplete;
- management representations used as fact without primary evidence.

### 3. Industry and Supply-Chain Specialist

ID: `industry_supply_chain_analyst`

Mission:

- map the real beneficiary layer and avoid choosing the wrong stock for the right theme;
- trace final product, platform, Tier 1/2, materials, equipment, inspection, infrastructure and service economics.

Required inputs:

- segment revenue/profit exposure;
- customer qualification and replaceability;
- capacity, yield, lead time and pricing power;
- better-peer and alternative-technology maps.

Hard vetoes:

- theme relation without revenue/profit connection;
- entity mapping uncertain;
- clearly superior listed beneficiary not compared;
- company exposure immaterial to consolidated earnings.

### 4. Valuation and Expectations Analyst

ID: `valuation_expectations_analyst`

Mission:

- determine what expectations are already embedded in the price;
- separate a good company from a good entry price;
- build bull/base/bear ranges from explicit assumptions.

Required inputs:

- PIT valuation snapshots;
- historical and peer ranges;
- earnings/FCF scenario drivers;
- price, volume and expectation change around the event.

Hard vetoes:

- target range has no reproducible assumptions;
- current price or share count is temporally inconsistent;
- scenario probability is emitted without calibration support;
- valuation depends on a metric invalid for the business model without explanation.

### 5. Market Microstructure and Execution Specialist

ID: `market_execution_specialist`

Mission:

- convert a paper signal into a realistic executable trade path;
- measure spread, liquidity, gap, halt, limit, auction and impact constraints.

Required inputs:

- first executable timestamp;
- market calendar/session;
- OHLCV, spread or proxy, turnover and order-size assumptions;
- borrow availability/cost for short-side research.

Hard vetoes:

- entry cannot be executed at the assumed price;
- liquidity is insufficient for the proposed size;
- halt/limit state ignored;
- borrow requirement missing for a short recommendation.

### 6. Quantitative Validation and Causal-Inference Analyst

ID: `quant_causal_validator`

Mission:

- test whether the observed return is repeatable, incremental and not a selection artifact;
- enforce holdout, negative controls, matched controls and cost-adjusted Net Alpha.

Required inputs:

- immutable signal records;
- issuer, TOPIX, sector and matched-control prices;
- event samples, confounders and split definitions;
- execution-cost assumptions.

Hard vetoes:

- PIT leakage;
- training/holdout contamination;
- sample definitions changed after observing results without revision record;
- claimed probability or alpha unsupported by the sample.

### 7. Short Seller and Adversarial Red Team

ID: `short_red_team`

Mission:

- construct the strongest coherent explanation for no move, downside or thesis failure;
- search for better-peer risk, accounting fragility, financing need, crowding and narrative gaps.

Required inputs:

- downside hypothesis;
- financing/dilution history;
- insider/major-holder and governance evidence;
- contradiction graph and negative controls.

Hard vetoes:

- no falsification condition;
- recommendation contains only upside reasoning;
- contradictory Tier A evidence is omitted;
- downside cannot be bounded because information quality is too poor.

### 8. Portfolio Risk and Capital Allocation Manager

ID: `portfolio_risk_allocator`

Mission:

- decide whether the idea improves the portfolio after correlation, concentration, liquidity and loss-budget constraints;
- distinguish stock verdict from position verdict.

Required inputs:

- current portfolio exposures;
- sector/theme/customer/supplier correlation graph;
- drawdown and tail scenarios;
- liquidity and intended position size.

Hard vetoes:

- concentration limit violated;
- correlated event cluster unacknowledged;
- loss budget or liquidity budget exceeded;
- recommendation lacks a position-size rationale when position advice is shown.

### 9. Data Provenance and PIT Auditor

ID: `data_pit_auditor`

Mission:

- verify source identity, licensing, timestamps, revisions, entity links and replayability;
- act as a decision-quality firewall.

Required inputs:

- evidence provenance records;
- source contract and health;
- content hashes and revision graph;
- entity master and time semantics.

Hard vetoes:

- unknown license for stored/used data;
- source or entity unresolved;
- `observedAt`/`firstExecutableAt` violation;
- latest-value overwrite destroys historical truth;
- recommendation cannot be deterministically replayed.

### 10. Personal Portfolio Suitability Adviser

ID: `personal_suitability_adviser`

Mission:

- translate the independent stock thesis into an actionable recommendation for the user's account and constraints;
- remain separate from the evidence verdict.

Required inputs:

- investment horizon and available capital;
- current holdings and concentration;
- NISA/tax-account and lot constraints;
- liquidity and downside tolerance.

Hard vetoes:

- user-specific inputs are missing but a specific position size is presented;
- suitability output is represented as evidence about the company;
- an account/tax assumption is stale or unverified.

### 11. CIO Synthesizer

ID: `cio_synthesizer`

Mission:

- assemble the final decision record without erasing dissent;
- identify which vetoes are binding, which evidence is unresolved and which next check has the highest value.

The CIO has no power to override a hard veto by narrative. A veto is cleared only by new evidence or a documented correction to the veto logic.

## Structured persona output

Every persona should emit a record shaped like:

```ts
type PersonaVerdict = {
  personaId: string;
  runId: string;
  issuedAt: string;
  informationCutoff: string;
  jurisdiction: string;
  stance: "support" | "oppose" | "neutral" | "abstain" | "veto";
  decisionView?: "BUY" | "WATCH" | "WAIT" | "AVOID";
  confidence?: number;
  evidenceRefs: string[];
  facts: string[];
  assumptions: string[];
  forecasts: string[];
  risks: string[];
  missingEvidence: string[];
  vetoCodes: string[];
  falsificationConditions: string[];
  nextEvidenceActions: string[];
  modelVersion: string;
};
```

Confidence is optional. It is omitted until the persona has enough historical outcomes for calibration in the relevant sector, regime and horizon.

## Committee decision protocol

1. Validate data/PIT provenance.
2. Run jurisdictional personas independently on the same immutable evidence package.
3. Record every verdict before showing other persona conclusions where possible.
4. Apply hard vetoes.
5. Build a dissent ledger; do not average disagreement away.
6. Separate:
   - company/business quality;
   - event/Edge validity;
   - valuation and timing;
   - execution feasibility;
   - portfolio suitability.
7. Produce a final decision only after unresolved evidence and abstentions are visible.
8. Persist the council package with the RecommendationRecord.
9. Score each persona later using outcomes relevant to its jurisdiction.

## Final output dimensions

Do not compress everything into one opaque score. Preserve at least:

- evidence quality;
- business/beneficiary quality;
- event/Edge strength;
- valuation attractiveness;
- timing/execution quality;
- downside severity;
- portfolio suitability;
- unresolved uncertainty;
- binding vetoes.

A user-facing label may still be BUY/WATCH/WAIT/AVOID, but the multidimensional state remains available.

## Persona calibration

Each persona receives historical performance only for decisions inside its jurisdiction.

Examples:

- Event PM: event classification and entry-route accuracy.
- Forensic analyst: later corrections, impairments, audit/governance outcomes.
- Supply-chain analyst: beneficiary ranking and revenue/profit realization.
- Valuation analyst: scenario range coverage and expectation error.
- Execution specialist: expected versus realized execution/slippage.
- Quant validator: out-of-sample alpha and false-discovery control.
- Red team: invalidation and drawdown warning recall.
- Portfolio manager: concentration and risk-budget outcomes.
- PIT auditor: leakage, revision and replay incidents.

Weights may adapt slowly from calibration, but they are capped and never bypass a hard veto. No persona is rewarded merely because the stock price rose.

## Treatment of existing investor-style agents

The Munger/Marks/Soros/Druckenmiller/Lynch/Klarman/Greenblatt/Simons/Dalio/Thorp-style agents should be treated as **question generators and mental-model lenses**, not authoritative synthetic investors.

Recommended v2 mapping:

- bias/inversion -> Short Red Team;
- cycle/regime/reflexivity -> Event PM + Portfolio Risk;
- growth story/quality/value -> Industry + Valuation;
- statistics/risk of ruin -> Quant + Portfolio Risk.

Their output may enrich questions, but cannot create a hard veto, confidence or BUY decision without normalized evidence.

## Scheduling integration

The hourly research schedule should not run the full council on every discovery item.

Use stages:

```text
hourly discovery sandbox
  -> cheap candidate package
  -> no council / no BUY

evidence package reaches minimum completeness
  -> selected specialist personas

recommendation candidate
  -> full council + veto protocol

outcome review date
  -> calibration and post-mortem council
```

This keeps cost and noise controlled while preserving early idea discovery.

## Definition of done

- [ ] persona catalog and JSON schema;
- [ ] `PersonaVerdict` validator;
- [ ] jurisdiction and hard-veto enforcement;
- [ ] abstention and unknown handling;
- [ ] append-only dissent ledger;
- [ ] deterministic committee replay;
- [ ] separation of stock thesis and personal suitability;
- [ ] calibration records by persona/domain/regime/horizon;
- [ ] migration plan from existing v1 and legend agents;
- [ ] fixture tests proving majority vote cannot override PIT/accounting/execution vetoes;
- [ ] no automatic order placement.
