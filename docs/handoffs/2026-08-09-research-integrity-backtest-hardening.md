# Research Integrity / Backtest hardening handoff — 2026-08-09

## Purpose

This handoff records the concrete Research OS integrity work completed after the PIT/J-Quants hardening chain and defines the stop boundary for Backtest work.

The goal is **not** to keep expanding Backtest governance. The canonical roadmap remains authoritative: the next material milestone is the real local Sanrio / Foundation pilot, with Security Master identity, PIT evidence, rights/provenance, benchmark availability and Corporate Action Clearance as real gates.

## Safety boundary

The work in this chain is validation / deterministic research infrastructure only.

It does **not** authorize:

- automatic Edge promotion,
- automatic learning adoption,
- BUY / LINE / broker orders,
- real-data redistribution,
- committing local EDINET/J-Quants/portfolio/brokerage data,
- bypassing the local Foundation evidence gate.

Runner/workflow changes were not required.

## Completed integrity chain

### Edge Decay / Production Gate / Holdout

- **PR #170 — Edge Decay strict dates**
  - real `YYYY-MM-DD` validation,
  - deterministic calendar-day difference,
  - invalid/future `lastCheckedAt` cannot become `fresh`.
- **PR #171 — Production Gate temporal provenance**
  - strict real `asOf`,
  - Holdout access `openedAt` must be an explicit-timezone instant available by the snapshot cutoff,
  - future Holdout PASS cannot support a current gate,
  - `decayChecked` is revalidated against the snapshot.
- **PR #172 — Holdout window strict dates**
  - lookup date, manifest `sealedAt`, window `from/to` must be real dates,
  - reversed windows fail closed.

### Backtest deterministic input boundary

- **PR #173 — temporal input conformance**
  - strict signal `observedAt`,
  - real `resolutionDate`,
  - real/strictly increasing/duplicate-free bar dates,
  - price Map key must match `series.code`,
  - signal ordering uses actual instants, not timestamp-string ordering.
- **PR #174 — PriceBar semantic conformance**
  - OHLC finite and positive,
  - volume is a non-negative safe integer,
  - high/low must contain open/close,
  - benchmark bars use the same contract.
  - An existing synthetic fixture was corrected rather than weakening the validator.
- **PR #175 — event resolution chronology**
  - event-resolution exit cannot precede entry,
  - same-day resolution remains allowed because date-only evidence cannot establish intraday ordering.
- **PR #176 — direct Backtest spec conformance**
  - `runBacktest()` no longer relies on the CLI schema having run first,
  - negative/fractional lag, invalid notional/cost/liquidity/holding/stop inputs fail closed.
- **PR #177 — benchmark provenance pin**
  - a declared benchmark requires a PriceSeries,
  - series code must equal `spec.benchmark`,
  - an undeclared benchmark series is rejected,
  - missing benchmark can no longer silently become `0 bps` and inflate gross alpha.
- **PR #178 — exact benchmark common-date alignment**
  - intended contract: issuer entry/exit dates must exist exactly in the benchmark series,
  - no `>= date` forward substitution for provider gaps,
  - missing exact entry/exit benchmark bars use explicit skip reasons.

### Required verification before any new Backtest work

Before touching Backtest again, verify current `main` contains both literals:

- `benchmark_missing_entry_bar`
- `benchmark_missing_exit_bar`

If either is absent, finish / recreate PR #178 from latest `main` before any additional Backtest changes.

If both are present and CI is green, treat this Backtest hardening chain as **complete enough**. Do not invent more Backtest governance without a newly measured, material defect.

## Generated-main drift procedure

Research OS generated files may advance `main` while a PR is under review. Do not force-push or rewrite a stale branch just to catch up.

Preferred safe procedure:

1. Read the latest `main` SHA.
2. Keep only the intended changed-file blob SHAs from the old branch.
3. Create a Git tree using latest `main` as the base tree and replace only those intended paths.
4. Create one new commit with latest `main` as parent.
5. Create a replacement branch / Draft PR.
6. Re-run Draft checks, mark Ready, run full checks, then merge using the expected head SHA.

This preserves generated artifacts while keeping the functional diff small and auditable.

## Where to go next

### 1. Return to Foundation / Security Master

Audit only concrete fail-open identity/provenance defects, for example:

- ambiguous security identity across effective dates,
- overlapping identity intervals,
- future identity mapping used for a past PIT snapshot,
- code / issuer mismatch that could bind evidence or prices to the wrong company,
- unsafe alias resolution.

Do not expand identity governance speculatively; require a reproducible defect.

### 2. Real local Sanrio pilot remains the primary real milestone

When local Mac evidence is available, the canonical first command remains:

```bash
bash scripts/run-sanrio-real-pilot-preflight-local.sh
```

Then:

- run only the printed `nextCommand`,
- rerun preflight after every successful stage,
- never guess timestamped filenames,
- never edit hashes / rename evidence to make lineage pass,
- never commit `data/edinet`, real price data, credentials, Recommendation/Outcome/Learning runtime JSONL, or broker/portfolio data,
- stop at `parity_complete_foundation_gate_pending`.

### 3. Real price / benchmark boundary remains real-data gated

Software hardening is not a real-market PASS. Still pending:

- real J-Quants Free missing/suspension/entitlement measurements,
- rights-verified TOPIX / sector benchmark source,
- Corporate Action Evidence / Clearance for raw unadjusted quantitative outcomes.

## Do not merge / disturb

Keep the intentional legacy / research Draft PRs untouched unless a newly measured requirement explicitly calls for them:

- PR #43 — legacy Decision Firewall reference, DO NOT MERGE,
- PR #1 — long-running research Draft, production merge forbidden until its research gates are met.
