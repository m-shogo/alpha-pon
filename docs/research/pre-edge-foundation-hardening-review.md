# Pre-Edge Foundation Hardening Review — 2026-08-05

Status: `REVIEW_COMPLETE_IMPLEMENTATION_PENDING`
Scope: PR #37 PIT Price Store v1 / PR #38 Pre-Edge Foundation and Stock Pro Council v2
Production trading authorization: `NONE`

## Review conclusion

The current direction is correct: Alpha Pon should strengthen identity, time, evidence, execution, replay and decision governance before expanding active Edges.

The design is not yet complete enough to mark the foundation ready. The gaps below are not requests for more features for their own sake. They are controls against false BUY decisions caused by data leakage, entity collision, ambiguous price basis, survivorship bias, non-executable prices, research overfitting or untraceable AI output.

No item in this document authorizes live LINE delivery, brokerage orders, Cloudflare/D1 changes, billing changes or committing licensed market data.

## 1. PIT Price Store v1 — must-fix review findings

These items should be resolved in PR #37 before Ready for review, or explicitly moved to a blocking follow-up with the milestone kept ungreen.

### 1.1 Adjusted and unadjusted rows need separate series identity

The current record supports `adjusted` and `adjustmentFactor`, but the series/revision identity does not include price basis and the selector cannot request it.

Consequences:

- adjusted and unadjusted rows for the same security, date, source and plan can be interpreted as revisions of one another;
- a backtest cannot explicitly require adjusted or unadjusted data;
- an apparently deterministic series can silently change basis.

Required contract:

- add an explicit selector dimension such as `priceBasis: adjusted | unadjusted` or include `adjusted` in the series identity;
- require event studies to declare the price basis;
- reject mixed-basis series unless a caller explicitly requests a conversion policy;
- preserve the corporate-action factor and factor provenance used for the chosen basis.

### 1.2 First executable time must not precede actual retrieval

`firstExecutableAt` represents the first time Alpha Pon could act using the record. It therefore cannot be earlier than either contractual availability or actual retrieval.

Required invariant:

```text
firstExecutableAt >= max(observedAt, retrievedAt)
```

A separate theoretical provider-availability study may use `observedAt`, but deterministic replay of Alpha Pon itself must not pretend it acted before retrieval.

### 1.3 Separate theoretical availability from actual-system replay

Two valid but different questions exist:

1. When was the provider data contractually available?
2. When did this Alpha Pon run actually possess it?

Required selection modes:

- `provider_available`: `observedAt <= cutoff` and `firstExecutableAt <= cutoff`;
- `system_replay`: also require `retrievedAt <= cutoff` and the exact ingestion snapshot/run.

The mode must be explicit in backtest/replay manifests. Results from the two modes must never be compared as though they were identical.

### 1.4 Reject unknown provider plan in governed research

The schema currently permits an `unknown` provider plan. Unknown may be retained in a quarantine/import-error record, but it must not enter a governed price series or recommendation input.

Required:

- reject `providerPlan=unknown` in the Price Store validator;
- reject blank/ambiguous source identity;
- distinguish rejected/quarantined imports from accepted append-only market records.

### 1.5 Enforce provider batch/source coherence

A provider batch should not be able to contain records attributed to a different source without an explicit mapping contract.

Required checks:

- provider ID and record source mapping;
- plan and capabilities consistency;
- source version consistency;
- retrieval-run identity consistency;
- query code/date range consistency;
- no record after the query information cutoff;
- deterministic batch hash or manifest.

### 1.6 Status and missing-reason compatibility matrix

A required `missingReason` is not enough. Invalid combinations can still create false market states.

Minimum compatibility rules:

- `suspended` -> exchange suspension or an explicitly versioned equivalent;
- `no_trade` -> no execution / zero valid trades, not provider failure;
- `missing` -> provider gap, outside entitlement or not yet available;
- `market_holiday` -> calendar-confirmed non-session record;
- `traded` -> no missing reason and valid OHLCV.

Unknown reasons should consume Unknown Budget and block recommendation use.

### 1.7 Corporate-action effective-time safety

An action can be announced before it becomes effective. The record must distinguish:

- announcement/observation time;
- ex-date/effective date;
- when the adjustment factor becomes applicable;
- which source/revision supplied the factor.

A future effective action may be stored as known evidence, but it must not alter historical price basis before the applicable boundary. Tests should prove that a later split announcement cannot leak into an earlier adjusted series.

### 1.8 Append concurrency and crash consistency

Append plus `fsync` is necessary but not sufficient if two writers can target the same JSONL file.

Required decision:

- enforce one writer with an owner-token lock; or
- use an append transaction journal and deterministic recovery.

Tests should cover concurrent duplicate attempts, interrupted append and a final partial line. Corrupt or partial data must be quarantined, not silently skipped or overwritten.

### 1.9 Benchmark completeness is a gate, not only a warning

A security row without issuer benchmark/sector benchmark may be accepted into storage, but it must not enter Event Study or Net Alpha.

Required downstream gate:

- issuer, TOPIX and sector series have the same declared cutoff and price basis;
- benchmark identity and membership are PIT-safe;
- missing benchmark data blocks measured Net Alpha rather than falling back silently.

## 2. Foundation components missing from the current roadmap

### 2.1 PIT Universe and Benchmark Membership Store

Security Master identifies entities, but research also needs to know which securities existed and belonged to each universe at each historical cutoff.

Store append-only membership for:

- listed/delisted status;
- IPO, relisting, market transfer and code changes;
- TOPIX/sector/index membership;
- investable-universe inclusion/exclusion reason;
- valid-from/valid-to and observed/retrieved times.

This prevents survivorship bias and using today's constituents in historical controls.

### 2.2 Capitalization and Corporate-Action Ledger

Price ranges and valuation require point-in-time shares and dilution truth.

Track:

- shares outstanding and treasury shares;
- stock splits/reverse splits;
- buybacks/cancellations;
- rights, warrants, convertibles and stock compensation;
- public offerings/private placements;
- mergers, exchanges and spin-offs;
- effective, announced, observed and executable boundaries.

A target price built with a future share count must be rejected.

### 2.3 PIT Fundamentals and Estimate Snapshots

Restated financial statements and latest estimates can leak future information into historical valuation.

Required:

- originally filed values and every correction;
- period, filing version, accounting standard and unit;
- published/observed/retrieved times;
- consensus/estimate vintage where licensed;
- derived metric lineage.

Latest-value overwrite is prohibited.

### 2.4 Decision Snapshot Manifest

A recommendation must consume one coherent snapshot rather than mixing independently latest stores.

Manifest should pin:

- information cutoff;
- code/rule/model/prompt versions;
- Security Master version;
- Universe/Benchmark membership version;
- Evidence Store version;
- Price Store snapshot and basis;
- calendar/timezone version;
- persona catalog and verdict versions;
- source-health state;
- all input content hashes.

Replay fails closed when any pinned input is unavailable or mismatched.

### 2.5 Derived Feature Lineage and Leakage Scanner

Every derived signal or feature needs:

- source record references;
- transformation code/version;
- information cutoff;
- earliest lawful observation time;
- earliest executable time;
- missing-data policy;
- adjustment/normalization policy.

A leakage scanner should reject features whose inputs were unavailable at signal generation time.

### 2.6 Research Preregistration and Experiment Registry

Before confirmatory testing, freeze:

- hypothesis and mechanism;
- inclusion/exclusion rules;
- event timestamp rule;
- entry/exit routes;
- benchmarks and controls;
- costs;
- training/validation/holdout split;
- primary metric and stopping rule;
- allowed rule revisions.

Post-result changes create a new version and never rewrite the original registration.

### 2.7 Data Quarantine, Quality SLO and Schema Drift

Bad input must not become an empty or apparently valid result.

Define states:

```text
accepted | quarantined | stale | partial | unavailable | rejected
```

Track per source:

- freshness;
- completeness;
- parse/schema failures;
- correction lag;
- entity-resolution failure;
- timestamp precision;
- license state;
- fallback activation.

A stale or partial source consumes Unknown Budget and may block the relevant council jurisdiction.

### 2.8 Time Authority and Precision

Not every source gives a precise timestamp. Preserve:

- original timestamp text;
- parsed timestamp;
- timezone and timezone-database version;
- precision (`second`, `minute`, `date_only`, `unknown`);
- inferred boundary and inference rule/version;
- exchange-calendar version.

Date-only evidence must not be assigned a precise intraday executable time without an explicit conservative rule.

### 2.9 Currency, FX, Fees, Taxes and Lot Rounding

Execution and valuation need explicit units.

At minimum:

- quote currency and reporting currency;
- PIT FX source and cutoff when conversion is used;
- commissions, fees, spread/slippage and taxes where applicable;
- unit/odd-lot rounding and partial-fill policy;
- whether results are pre-tax or after-tax.

These are execution overlays, not modifications to raw market records.

### 2.10 Human Override and Decision Audit Ledger

Human judgment remains allowed, but must be reviewable.

Record:

- previous machine decision;
- override decision and scope;
- actor;
- time;
- reason and evidence refs;
- whether a hard veto was cleared and by which rule/evidence;
- outcome review.

No override may delete the original recommendation, dissent or veto.

### 2.11 AI/Model Risk and Prompt-Injection Boundary

Documents, web pages, filings and transcripts are untrusted data, not agent instructions.

Required:

- strip/ignore embedded instructions from source documents;
- preserve raw content hash separately from normalized facts;
- pin model, prompt, tool and parser versions;
- deterministic settings/seed where supported;
- log structured validation failures without storing secrets;
- require evidence references for every material generated claim;
- quarantine output that cannot be reproduced or grounded.

## 3. Stock Pro Council v2 hardening

### 3.1 Independent first-pass verdicts

Personas should produce an initial sealed verdict from the same immutable evidence package before seeing other persona conclusions. A second deliberation pass may respond to dissent, but both versions are preserved.

This reduces anchoring and pseudo-consensus.

### 3.2 Veto lifecycle contract

A veto needs more than a string code.

Minimum fields:

```text
vetoId
vetoCode
ruleVersion
personaId
scope
raisedAt
informationCutoff
evidenceRefs
status: open | cleared | superseded | expired
clearanceRequirements
clearedAt
clearedByEvidenceRefs
supersedesVetoId
```

The persona that benefits from clearing a veto cannot silently clear it. CIO cannot clear a binding veto by narrative.

### 3.3 Required-persona matrix by decision type

Not every recommendation needs every specialist, but required coverage must be deterministic.

Examples:

- misconduct/accounting event -> Event PM + Forensic + Data/PIT + Execution + Red Team;
- technology commercialization -> Industry/Supply Chain + Valuation + Data/PIT + Red Team;
- short-side recommendation -> Execution/Borrow + Forensic + Quant + Portfolio Risk;
- position-size advice -> Portfolio Risk + Personal Suitability.

A missing required persona produces `incomplete`, not implicit support.

### 3.4 Conditional specialist lenses

Add conditional, non-hourly specialists where evidence requires them:

- legal/regulatory and exchange-rules specialist;
- macro/rates/FX/regime attribution specialist;
- model-risk/research-governance auditor.

They should abstain outside jurisdiction and should not inflate vote counts.

### 3.5 Calibration governance

Do not automatically increase persona influence from small samples.

Required:

- minimum sample size by jurisdiction/horizon;
- calibration intervals, not only point estimates;
- shrinkage toward neutral for sparse samples;
- capped weight changes;
- versioned human approval before production weight changes;
- separate accuracy, veto usefulness, false-block rate and economic value;
- no reward solely because the stock rose.

## 4. Unknown Budget must be typed and blocking

Keep separate counters/states for:

- entity;
- source;
- license;
- event/publication time;
- retrieval time;
- execution route;
- price basis;
- benchmark membership;
- corporate action/share count;
- evidence gap;
- confounder;
- counterfactual;
- valuation;
- liquidity/borrow;
- portfolio exposure;
- model/replay reproducibility.

The Recommendation gate should define which unknown types are fatal for BUY, which force WAIT/WATCH and which are informational.

## 5. Revised dependency order

```text
P0   official-source safety scan + discovery sandbox isolation
P1   LINE consolidated notification — COMPLETED
P2   PIT Price Store v1
P2.5 J-Quants Free PriceProvider
P2.6 EDINET Version 2
P3   Security Master + PIT universe/benchmark membership
P4   Bitemporal Evidence Store + capitalization/fundamentals vintages
P5   Document Diff + Claim/Contradiction/Revision Graph
P6   Market Calendar + Execution Reality + cost overlays
P7   Recommendation & Outcome + preregistration
P8   Stock Pro Council v2 + veto/dissent/calibration
P9   Decision Snapshot + Deterministic Replay + Portfolio Overlay
P10  Known-Bad first complete Evidence Package
P11  Signal Store + executable Event Study + Net Alpha
P12  official-source pilots and research scale-up
P13  Technology Commercialization Graph
P14  first Technology Edge active-research promotion
P15  shadow/holdout/11-Gate validation
```

Discovery sandbox continues through P0-P9 but cannot affect BUY, score, Gate, Production or active Edge counts.

## 6. Ready criteria for PR #37

PR #37 remains Draft until all of the following are true:

- Actions jobs actually start and execute steps;
- CI, Check and Research OS are green on the exact latest HEAD;
- adjusted/unadjusted series identity is unambiguous;
- executable time cannot precede retrieval;
- provider plan/source unknown states are rejected or quarantined;
- status/reason matrix is validated;
- corporate-action effective-time leakage is tested;
- append concurrency/recovery policy is explicit;
- no licensed real prices are committed.

## 7. Ready criteria for PR #38

PR #38 remains Draft until:

- PR #37 roadmap conflict is resolved;
- the P0-P15 dependency order is reflected in the canonical roadmap;
- existing v1/legend agent migration is explicit;
- veto lifecycle, required-persona matrix and calibration governance are specified;
- discovery sandbox isolation is validator-testable;
- CI jobs execute and pass on the exact latest HEAD.

## 8. Non-actions confirmed

- No billing or spending-limit change.
- No Cloudflare/D1 mutation.
- No secret or credential read/change/commit.
- No production LINE send.
- No brokerage order or automatic trading.
- No real market-price commit.
- No active Edge promotion or Production Gate movement.
