# Handoff — PIT Price Store v1 Review Fixes

Status: `BLOCKING_BEFORE_READY`
Updated: 2026-08-05 JST
PR: #37

## Purpose

Close the remaining PIT and series-identity gaps found during the Pre-Edge Foundation review. These fixes protect Backtest, Deterministic Replay, Event Study and Recommendation from price-basis mixing, execution-before-retrieval, ambiguous provider state and future corporate-action leakage.

This handoff does not authorize real API access, licensed price commits, live LINE delivery, Cloudflare/D1 changes, billing changes or brokerage orders.

## Required fixes

### 1. Explicit price basis in series identity

Problem:

- `adjusted` exists on the record, but revision/selection identity does not distinguish adjusted from unadjusted rows.
- same date/source/plan rows can collide as revisions;
- caller cannot explicitly request a basis.

Required:

- add a selector dimension such as `priceBasis: "adjusted" | "unadjusted"`;
- include basis in target/revision/selection identity;
- reject mixed-basis conversion without an explicit policy;
- keep adjustment factor and corporate-action provenance.

### 2. Execution cannot precede retrieval

Required invariant:

```text
firstExecutableAt >= max(observedAt, retrievedAt)
```

Add a dedicated validator issue code and fixture.

### 3. Explicit cutoff mode

Support two explicit modes:

```text
provider_available
  observedAt <= cutoff
  firstExecutableAt <= cutoff

system_replay
  observedAt <= cutoff
  retrievedAt <= cutoff
  firstExecutableAt <= cutoff
  ingestion snapshot/run pinned
```

Default Recommendation/Deterministic Replay usage must be `system_replay`. A theoretical provider study must opt into `provider_available`.

### 4. Reject unknown governed provider state

- `providerPlan=unknown` cannot enter accepted price records;
- unknown/blank source cannot enter accepted records;
- unresolved imports go to quarantine/error reporting, not append-only accepted series.

### 5. Provider batch coherence

Validate:

- provider ID to record source mapping;
- capabilities/plan/license/source-version/retrievedAt consistency;
- requested codes/date range;
- no data beyond query cutoff;
- deterministic run/batch identity.

### 6. Status and missing reason matrix

Minimum rules:

- `traded`: OHLCV required, no missing reason;
- `suspended`: no OHLCV, exchange-suspension reason;
- `no_trade`: no OHLCV, no-execution reason;
- `missing`: provider-gap/outside-entitlement/not-yet-available;
- `market_holiday`: calendar-confirmed non-session;
- unknown reason blocks downstream Recommendation use.

### 7. Corporate-action effective-time safety

Distinguish:

- announcement/observed time;
- effective/ex date;
- factor applicability boundary;
- factor source/revision.

A future-effective action can be known evidence but must not alter an earlier price basis before its applicable boundary.

### 8. Append concurrency and partial-write recovery

Choose and document one:

- owner-token single-writer lock; or
- transaction journal with deterministic recovery.

Do not silently skip malformed/partial final lines. Quarantine and block use until explicit repair.

### 9. Downstream benchmark completeness

Storage may retain a security record with missing benchmark metadata, but Event Study/Net Alpha must require issuer, TOPIX and sector series with:

- the same cutoff mode;
- declared price basis;
- compatible calendar;
- no silent fallback.

## Required tests

1. adjusted and unadjusted records coexist without revision collision;
2. mixed-basis selector omission throws;
3. firstExecutable before retrievedAt is rejected;
4. system replay excludes a record retrieved after cutoff;
5. provider-available mode includes it only when explicitly selected;
6. unknown provider plan/source is rejected/quarantined;
7. mismatched batch source/query range is rejected;
8. invalid status/reason combinations are rejected;
9. future-effective split cannot leak adjustment into earlier series;
10. concurrent duplicate append is deterministic and safe;
11. interrupted/partial append is quarantined;
12. Event Study input without complete benchmark set is blocked.

## Validation commands after implementation

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tsconfig.test.json
pnpm exec tsc --noEmit -p tsconfig.scripts.json
pnpm research:validate
pnpm research:generate:check
pnpm research:check:history
pnpm research:check:docs
pnpm research:backtest:fixtures
pnpm research:test
pnpm exec tsx tests/research/price-store.test.ts
pnpm exec tsx src/research/cli/validate-prices.ts --root=research/fixtures/prices
```

Then require CI / Check / Research OS to execute actual steps and pass on the exact latest HEAD.

## Ready rule

Do not mark PR #37 Ready or merge while any item above is unresolved or while GitHub Actions still fails before runner steps begin.
