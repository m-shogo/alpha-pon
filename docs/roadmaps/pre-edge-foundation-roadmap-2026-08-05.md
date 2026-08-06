# Alpha Pon Pre-Edge Foundation Roadmap — 2026-08-05

Status: `ACTIVE_SUPPORTING_ROADMAP`
Parent: `docs/roadmaps/alpha-pon-current-roadmap-2026-08-05.md`
Integration note: merge this track into the canonical roadmap after PR #37 is resolved. Do not create a textual conflict with the PIT Price Store branch merely to renumber phases.

## Decision

New active Edge promotion is intentionally delayed until the system can preserve evidence, time, execution reality, disagreement and outcome history correctly.

This does **not** mean discovery stops. Alpha Pon keeps a low-cost `discovery-sandbox` that may collect candidate ideas, APIs, datasets and possible mechanisms. Sandbox output cannot change a score, issue BUY, enter a Production Gate or count as an active Edge.

```text
discovery-sandbox
  -> candidate package only
  -> no BUY / no score / no gate movement
  -> waits for foundation gates

validated research path
  -> evidence package
  -> PIT-safe price truth
  -> executable event study
  -> recommendation record
  -> outcome answer-check
```

## Why foundation comes first

A clever Edge on weak infrastructure usually produces a convincing but unrepeatable story. The highest-value work before broad Edge hunting is therefore not another indicator. It is the machinery that can tell the difference between:

- fact and interpretation;
- event time and knowledge time;
- latest truth and what was knowable at the time;
- attractive company and attractive price;
- correct thesis and lucky return;
- paper profit and executable return;
- stock quality and suitability for the user's portfolio.

## Foundation gates before broad Edge activation

### F0 — Security Master and Entity Identity

Build one canonical identity layer for issuer, listed security, market, code history, parent/subsidiary, segment, brand, facility and official account.

Required capabilities:

- code/name changes and delisting history;
- parent/child and listed subsidiary relationships;
- security versus issuer separation;
- segment-to-company revenue mapping;
- official website and official-source reverse links;
- corporate-action identity changes;
- entity-confidence and unresolved-collision ledger.

No evidence is attached to a ticker by fuzzy name alone.

### F1 — Bitemporal Evidence Store

Extend PIT discipline from prices to every investment fact.

Every claim should preserve at least:

- `eventAt`: when the underlying event occurred;
- `publishedAt`: when the source published it;
- `observedAt`: when Alpha Pon could lawfully know it;
- `retrievedAt`: when Alpha Pon fetched it;
- `effectiveFrom` / `effectiveTo`: when the claim was considered valid;
- source, document ID, content hash and revision chain;
- entity references;
- evidence tier;
- contradiction and supersession references;
- expiry or recheck date.

Latest-value overwrite is forbidden for evidence used in historical validation.

### F2 — Change Intelligence and Revision Graph

Prefer document diffs and state transitions over repeated summaries.

Examples:

- guidance raised, maintained, withdrawn or corrected;
- investigation opened, expanded, completed or disputed;
- audit opinion changed;
- director resigned or responsibility changed;
- capex plan moved from intention to order to commissioning;
- customer sample moved to qualification or failed qualification.

The system should store what changed, what did not change and which prior statement was superseded.

### F3 — Market Calendar and Execution Reality

A signal is not executable merely because a document exists.

Required:

- JPX trading calendar and session boundaries;
- holidays, half-days and special handling;
- opening auction, closing auction and continuous session distinction;
- limit-up/limit-down, halt and suspension;
- spread, liquidity, market impact and lot constraints;
- borrow availability and borrow cost when short-side research is used;
- previous close, next open and first executable route kept separate;
- odd-lot / personal-account implementation as a separate overlay.

### F4 — Decision Firewall

Raw data must not jump directly to BUY.

```text
raw observation
  -> normalized claim
  -> evidence package
  -> falsifiable hypothesis
  -> forecast/scenario
  -> recommendation
  -> personal portfolio overlay
  -> explicit human order action
```

Each transition has a validator. A lower layer cannot silently fabricate a field required by a higher layer.

### F5 — Recommendation, Outcome and Calibration

Use the Recommendation & Outcome contract introduced in PR #37.

Additional requirements:

- prediction calibration by horizon, sector, regime and decision type;
- Brier/log-loss style calibration for probabilities when probabilities are emitted;
- distinguish thesis error, timing error, execution error, data error and confounder;
- preserve forecast revisions without rewriting the original;
- compare issuer, TOPIX, sector and matched controls;
- retain rejected and failed forecasts.

### F6 — Portfolio and Personal Suitability Overlay

Stock attractiveness and portfolio suitability are different decisions.

Portfolio layer should consider:

- current sector/theme concentration;
- correlated event exposure;
- maximum position and loss budget;
- liquidity relative to intended position;
- NISA/tax-account constraints;
- cash needs and holding horizon;
- whether a better peer provides the same thesis with less risk.

This layer may downgrade BUY to WATCH/WAIT for the user without changing the underlying stock thesis.

### F7 — Replay, Observability and Incident Recovery

Every recommendation and scheduled run should be reproducible from immutable inputs.

Required:

- run ID and code/config versions;
- input content hashes;
- deterministic replay mode;
- source-health and schema-drift alerts;
- missing-data and stale-data budgets;
- decision trace from evidence to final label;
- failed-run recovery without double counting;
- redacted logs and no secrets in artifacts.

## Root system improvements to prioritize

1. **Security Master** — eliminate company/ticker/entity confusion before adding more sources.
2. **Bitemporal Evidence Store** — apply PIT to filings, news, events, relationships and estimates, not only price.
3. **Document Diff Engine** — detect state transitions and corrections instead of summarizing whole documents repeatedly.
4. **Claim/Contradiction Graph** — store supporting, conflicting and superseding evidence explicitly.
5. **Execution Simulator** — calculate realistic entry routes and costs before Net Alpha.
6. **Decision Firewall** — enforce observation -> evidence -> hypothesis -> forecast -> recommendation boundaries.
7. **Outcome Calibration** — measure whether confidence and scenarios were calibrated, not merely whether price rose.
8. **Portfolio Risk Graph** — expose hidden concentration across themes, customers, suppliers and macro factors.
9. **Value-of-Information Scheduler** — choose the next research action by expected decision value per cost/time.
10. **Negative-Control Library** — keep no-move, better-peer and external-incident controls beside every Edge.
11. **Source Contract and Schema Drift** — detect API field/meaning changes before they corrupt research.
12. **Deterministic Replay** — reproduce any historical recommendation from the exact information available then.
13. **Knowledge Expiry** — facts, relationships and model assumptions receive recheck dates and decay states.
14. **Edge Retirement Policy** — retire an Edge when crowding, regime dependence, capacity or decay removes value.
15. **Unknown Budget** — count unresolved identity, timing, rights and evidence gaps rather than hiding them in one score.

## API and data-source expansion principles

Do not collect APIs because they exist. Add a source only when it closes a named evidence gap.

Candidate classes for future pilots:

- official disclosure and revision sources;
- exchange measures, corporate actions, halts, short/borrow and market statistics;
- government procurement, subsidies, permits, trade and industrial statistics;
- central-bank and macro series required by a specific confounder;
- patents, grants, standards and scientific evidence for commercialization transitions;
- objective demand, capacity, logistics, booking, traffic or installation data where rights permit;
- company-site change detection and official webcast/transcript evidence;
- licensed alternative data only after incremental-value and storage-right review.

Every source remains `catalog_only` until directness, PIT semantics, rights, failure isolation, maintenance cost, tests and incremental value are documented.

## Discovery sandbox contract

Scheduled research may continue finding ideas while foundation work proceeds, but each item is limited to:

- candidate mechanism;
- beneficiary layers;
- possible primary sources;
- required data;
- obvious confounders;
- falsification idea;
- why this may be different from existing Edge families;
- next cheapest evidence check.

Forbidden in the sandbox:

- BUY/WATCH score changes;
- target prices or probabilities;
- active Edge registration;
- Production Gate movement;
- claim that the idea has measured alpha;
- use of social chatter as investment evidence.

## Minimum readiness before the next new active Edge

- [x] P1 LINE consolidated notification merged.
- [ ] PIT Price Store contract merged and CI green.
- [ ] First real issuer, TOPIX and sector series validated.
- [ ] EDINET Version 2 migration green.
- [ ] Security Master v1 green.
- [ ] Bitemporal Evidence Store v1 green.
- [ ] Market Calendar / Execution Route v1 green.
- [ ] Recommendation & Outcome persistence implemented.
- [ ] Stock Pro Council v2 governance implemented.
- [ ] Deterministic replay for one historical recommendation.
- [ ] One Known-Bad evidence package and executable event study.
- [ ] Shadow recommendation with no live order.

## Opinionated priority

The next major architectural investment after PIT prices should be **Bitemporal Evidence + Security Master**, not another broad collector. Without them, adding APIs increases conflicting facts, entity errors and untraceable revisions faster than it increases Edge quality.

The next research investment should be one deeply reconstructed Known-Bad case, not twenty shallow candidate Edges. Broad technology discovery may continue in the sandbox, but promotion waits until the system can falsify, replay and answer-check it.
